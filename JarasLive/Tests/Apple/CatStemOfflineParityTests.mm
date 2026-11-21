// Exercise the shipped offline Core ML worker against desktop PyTorch fixtures.
#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <CoreML/CoreML.h>
#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstring>
#include <memory>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <cassert>
#include <iostream>
#include <fstream>
#include <sys/resource.h>
#include "CatStemSpectrogram.hpp"
#include "CatStemCoreMLTestKernel.hpp"
using namespace CatStemRealtime;
static std::vector<float> readPlanar(NSURL *url, int64_t frames) {
    NSError *error=nil;
    auto file=[[AVAudioFile alloc] initForReading:url commonFormat:AVAudioPCMFormatFloat32 interleaved:NO error:&error];
    assert(file && file.length==frames && file.processingFormat.channelCount==2 && file.processingFormat.sampleRate==44100);
    auto buffer=[[AVAudioPCMBuffer alloc] initWithPCMFormat:file.processingFormat frameCapacity:unsigned(frames)];
    assert([file readIntoBuffer:buffer error:&error]);assert(buffer.frameLength==frames);
    std::vector<float> result(frames*2);
    for(unsigned ch=0;ch<2;ch++)std::copy_n(buffer.floatChannelData[ch],frames,result.data()+ch*frames);
    return result;
}
int main(int argc,const char *argv[]) { @autoreleasepool {
    assert(argc==3);NSURL *model=[NSURL fileURLWithPath:@(argv[1])];NSURL *fixtures=[NSURL fileURLWithPath:@(argv[2])];
    std::thread worker([model,fixtures]{@autoreleasepool{
        for(unsigned frames:{258001u,358001u,67u}) { @autoreleasepool {
            NSURL *folder=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString]];
            [NSFileManager.defaultManager createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil];
            NSURL *source=[fixtures URLByAppendingPathComponent:[NSString stringWithFormat:@"input-%u.wav",frames]];
            double last=0;unsigned updates=0;
            separateCoreMLFile(source,folder,model,[]{return false;},[&](double progress){assert(progress>=last && progress<=1);last=progress;updates++;},MLComputeUnitsCPUOnly);
            assert(last==1 && updates>=2);
            auto original=readPlanar(source,frames);std::vector<float> sum(frames*2);
            for(NSString *name in @[@"Vocal",@"Drum",@"Bass",@"Guitar",@"Other"]) {
                auto actual=readPlanar([folder URLByAppendingPathComponent:[name stringByAppendingString:@".wav"]],frames);
                for(unsigned i=0;i<actual.size();i++){assert(std::isfinite(actual[i]));sum[i]+=actual[i];}
                if([name isEqual:@"Other"])continue;
                std::vector<float> expected(frames*2);std::ifstream file([[fixtures URLByAppendingPathComponent:[NSString stringWithFormat:@"%@-%u.f32",name,frames]].path UTF8String],std::ios::binary);
                assert(file.read(reinterpret_cast<char*>(expected.data()),expected.size()*sizeof(float)));
                double error=0,energy=0,maximum=0;
                for(unsigned i=0;i<actual.size();i++){const double d=actual[i]-expected[i];error+=d*d;energy+=double(expected[i])*expected[i];maximum=std::max(maximum,std::abs(d));}
                const double rms=std::sqrt(error/actual.size()),relative=std::sqrt(error/std::max(energy,1e-16));
                std::cout<<"PARITY frames="<<frames<<" stem="<<name.UTF8String<<" rms="<<rms<<" relative="<<relative<<" max="<<maximum<<std::endl;
                // Numerical backend comparison uses musical-length windows.
                // A 67-sample item is far shorter than one FFT frame: check
                // exact placement, finite output and unity reconstruction,
                // while reporting (not hiding) sparse-input backend variance.
                if (frames >= 4096) assert(rms<=2e-5 || relative<=.002);
            }
            for(unsigned i=0;i<sum.size();i++)assert(std::abs(sum[i]-original[i])<1e-6);
            unsigned completed=0;bool cancelled=false;
            try{separateCoreMLFile(source,folder,model,[&]{return completed>0;},[&](double){completed++;},MLComputeUnitsCPUOnly);}catch(const std::exception&){cancelled=true;}
            assert(cancelled && completed==1);
            if (frames == 258001) {
                bool enteredModel=false, cancelledBetweenStages=false;
                try {
                    separateCoreMLFile(source,folder,model,[&]{return enteredModel;},
                        [&](double value){if(value>.04 && value<1)enteredModel=true;},MLComputeUnitsCPUOnly);
                } catch(const std::exception&) { cancelledBetweenStages=true; }
                assert(enteredModel && cancelledBetweenStages);
            }
            [NSFileManager.defaultManager removeItemAtURL:folder error:nil];
        } }
        // A constant/DC item must stay entirely in Other without loading a graph.
        NSURL *folder=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString]];
        [NSFileManager.defaultManager createDirectoryAtURL:folder withIntermediateDirectories:YES attributes:nil error:nil];
        NSURL *source=[folder URLByAppendingPathComponent:@"dc.wav"];NSError *error=nil;
        auto format=[[AVAudioFormat alloc] initStandardFormatWithSampleRate:44100 channels:2];
        { @autoreleasepool {
            auto file=[[AVAudioFile alloc] initForWriting:source settings:format.settings error:&error];
            auto buffer=[[AVAudioPCMBuffer alloc] initWithPCMFormat:format frameCapacity:67];buffer.frameLength=67;
            for(unsigned ch=0;ch<2;ch++)std::fill_n(buffer.floatChannelData[ch],67,.25f);
            assert([file writeFromBuffer:buffer error:&error]);
        } }
        separateCoreMLFile(source,folder,[NSURL fileURLWithPath:@"/nonexistent"],[]{return false;},[](double){});
        for(NSString *name in @[@"Vocal",@"Drum",@"Bass",@"Guitar",@"Other"]){auto output=readPlanar([folder URLByAppendingPathComponent:[name stringByAppendingString:@".wav"]],67);for(float value:output)assert(value==([name isEqual:@"Other"]?.25f:0));}
        [NSFileManager.defaultManager removeItemAtURL:folder error:nil];
        struct rusage usage{};getrusage(RUSAGE_SELF,&usage);
        std::cout<<"CATSTEM_OFFLINE_DESKTOP_PARITY_CPU_OK peakRSS="<<usage.ru_maxrss<<std::endl;
    }});worker.join();
}}
