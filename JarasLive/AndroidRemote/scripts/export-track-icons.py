#!/usr/bin/env python3
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[1]
source=(root.parent/'Apple/Shared/TrackInstrumentIcons.swift').read_text().split('\nstruct TrackInstrumentPickerModal')[0]
appendix='\nvar result:[String:Any]=[:]\nfor icon in TrackInstrumentIcon.allCases {\n var ops:[[Any]]=[]\n if icon.lettering == nil { TrackInstrumentIconView.drawing(icon).cgPath.applyWithBlock { pointer in\n  let e=pointer.pointee\n  let count = e.type == .addCurveToPoint ? 3 : e.type == .addQuadCurveToPoint ? 2 : e.type == .closeSubpath ? 0 : 1\n  if (0..<count).contains(where: { !e.points[$0].x.isFinite || !e.points[$0].y.isFinite }) { return }\n  switch e.type {\n  case .moveToPoint: ops.append(["M", e.points[0].x,e.points[0].y])\n  case .addLineToPoint: ops.append(["L", e.points[0].x,e.points[0].y])\n  case .addQuadCurveToPoint: ops.append(["Q",e.points[0].x,e.points[0].y,e.points[1].x,e.points[1].y])\n  case .addCurveToPoint: ops.append(["C",e.points[0].x,e.points[0].y,e.points[1].x,e.points[1].y,e.points[2].x,e.points[2].y])\n  case .closeSubpath: ops.append(["Z"])\n  @unknown default: break\n  }\n }\n }\n result[icon.rawValue] = ["title": icon.title, "text":icon.lettering ?? "", "ops":ops]\n}\nlet data=try JSONSerialization.data(withJSONObject:result,options:[.sortedKeys])\ntry data.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))\nprint("Exported \\(result.count) production instrument icons")\n'
with tempfile.TemporaryDirectory(prefix='catlive-android-icons-') as tmp:
    script=Path(tmp)/'export.swift'
    script.write_text(source+appendix)
    subprocess.run(['swift',str(script),str(root/'app/src/main/assets/track-icons.json')],check=True)
