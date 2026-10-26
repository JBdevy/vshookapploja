#!/usr/bin/env python3
"""Partition the full FP32 desktop model without changing its computation.

Core ML on iOS 16 retains too much working memory for the complete graph on
2 GB devices. Boundaries are exact intermediate tensors; the worker loads one
stage at a time and releases inputs after their final consumer. Tested with
coremltools 9.0. No quantization, pruning, or shorter audio context is applied.
"""
import argparse
import gc
import json
from pathlib import Path
import sys

import coremltools as ct
from coremltools.converters.mil import Builder as mb
from coremltools.converters.mil.debugging_utils import extract_submodel

STAGES = 32
CHECKPOINT_SHA = "34c22ccb381c6f9fdbf324f04e1e2fe21aaaf293f5ded163a162697ff9a02ddd"


def tile_long_convolutions(model):
    """Avoid an iOS 16 CPU Conv1D error with very long temporal tensors.

    The physical iPad returned incorrect values for the 48-to-6 convolution
    at width 85,995, although the same graph was correct on macOS. Each tile
    includes the exact input halo required by its convolution kernel. Only
    these local convolutions are tiled: normalization and transformer
    attention still see the entire 7.8-second training context.
    """
    spec = model.get_spec()
    program = ct.models.utils._milproto_to_pymil.load(
        spec, spec.specificationVersion, model.weights_dir)
    function = program.functions["main"]
    with function:
        for operation in list(function.operations):
            if (operation.op_type != "conv" or len(operation.x.shape) != 3 or
                    max(operation.x.shape[-1], operation.outputs[0].shape[-1]) <= 8192):
                continue
            width = operation.x.shape[-1]
            output_width = operation.outputs[0].shape[-1]
            stride = int(operation.strides.val[0])
            dilation = int(operation.dilations.val[0])
            kernel = int(operation.weight.shape[-1])
            effective_kernel = (kernel - 1) * dilation + 1
            assert operation.pad_type.val in ("valid", "custom")
            padding = int(operation.pad.val[0]) if operation.pad_type.val == "custom" else 0
            step = min(4096, (8192 - effective_kernel) // stride + 1)
            pieces = []
            for start in range(0, output_width, step):
                count = min(step, output_width - start)
                begin = start * stride - padding
                end = (start + count - 1) * stride - padding + effective_kernel
                first, last = max(begin, 0), min(end, width)
                source = mb.slice_by_index(
                    x=operation.x, begin=[0, 0, first],
                    end=[operation.x.shape[0], operation.x.shape[1], last],
                    before_op=operation)
                arguments = dict(
                    x=source, weight=operation.weight, strides=operation.strides,
                    pad_type="custom", pad=[first - begin, end - last],
                    dilations=operation.dilations, groups=operation.groups,
                    before_op=operation)
                if operation.bias is not None:
                    arguments["bias"] = operation.bias
                value = mb.conv(**arguments)
                assert value.shape[-1] == count
                pieces.append(value)
            value = mb.concat(values=pieces, axis=2, name=operation.outputs[0].name,
                              before_op=operation)
            function.replace_uses_of_var_after_op(
                anchor_op=operation, old_var=operation.outputs[0], new_var=value)
            function.remove_ops([operation])
    return ct.convert(program, convert_to="mlprogram",
                      minimum_deployment_target=ct.target.iOS16,
                      compute_precision=ct.precision.FLOAT32, skip_model_load=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    # extract_submodel deep-copies a long MIL operation graph.
    sys.setrecursionlimit(max(sys.getrecursionlimit(), 100000))
    args.output.mkdir(parents=True, exist_ok=True)
    model = ct.models.MLModel(str(args.source), skip_model_load=True)
    spec = model.get_spec()
    metadata = spec.description.metadata.userDefined
    assert metadata["catlive.source_sha256"] == CHECKPOINT_SHA
    assert metadata["catlive.window_frames"] == "343980"
    program = ct.models.utils._milproto_to_pymil.load(
        spec, spec.specificationVersion, model.weights_dir)
    model._mil_program = program
    function = program.functions["main"]
    operations = list(function.operations)
    indices = {operation: index for index, operation in enumerate(operations)}
    compute = [index for index, operation in enumerate(operations)
               if not operation.op_type.startswith("const")]
    cuts = [compute[(len(compute) * index) // STAGES - 1]
            for index in range(1, STAGES)] + [len(operations) - 1]
    original = set(function.inputs)
    final = {value.name for value in function.outputs}
    stages = []
    start = -1
    for index, end in enumerate(cuts, 1):
        outputs = [value.name for operation in operations[start + 1:end + 1]
                   if not operation.op_type.startswith("const")
                   for value in operation.outputs
                   if value.val is None and (value.name in final or
                       any(indices[child] > end for child in value.child_ops))]
        assert outputs
        needed, visited = set(), set()

        def depend(value):
            if isinstance(value, (list, tuple)):
                for child in value:
                    depend(child)
                return
            if not hasattr(value, "name") or value.name in visited:
                return
            visited.add(value.name)
            if value.name in original:
                needed.add(value.name)
                return
            if value.val is not None:
                return
            if indices[value.op] <= start:
                needed.add(value.name)
                return
            for child in value.op.inputs.values():
                depend(child)

        for operation in operations[start + 1:end + 1]:
            for value in operation.outputs:
                if value.name in outputs:
                    depend(value)
        suffix = "" if index == 1 else str(index)
        destination = args.output / f"CatStemHTDemucs6Offline{suffix}.mlpackage"
        stage = extract_submodel(model, outputs=outputs, inputs=sorted(needed))
        stage = tile_long_convolutions(stage)
        stage.save(str(destination))
        stages.append(destination)
        print(f"Stage {index}/{STAGES}: {len(needed)} inputs, {len(outputs)} outputs", flush=True)
        start = end
        del stage
        gc.collect()

    for index, path in enumerate(stages, 1):
        stage = ct.utils.load_spec(str(path))
        metadata = stage.description.metadata.userDefined
        metadata["catlive.source_checkpoint"] = "5c90dfd2-34c22ccb"
        metadata["catlive.source_sha256"] = CHECKPOINT_SHA
        metadata["catlive.window_frames"] = "343980"
        metadata["catlive.offline_quality"] = "desktop-full-context"
        metadata["catlive.stage"] = str(index)
        metadata["catlive.stage_count"] = str(STAGES)
        future = set(final)
        for later in stages[index:]:
            future.update(value.name for value in ct.utils.load_spec(str(later)).description.input)
        metadata["catlive.keep_after"] = json.dumps(sorted(future))
        (path / "Data/com.apple.CoreML/model.mlmodel").write_bytes(stage.SerializeToString())
    print(f"Ready: {STAGES} full-context FP32 model stages in {args.output}", flush=True)


if __name__ == "__main__":
    main()
