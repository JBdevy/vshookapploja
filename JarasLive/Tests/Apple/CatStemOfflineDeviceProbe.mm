// Isolated physical-device quality and memory probe. Never reads a user project.
#import <UIKit/UIKit.h>
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
#include <mach/mach.h>
#include <sys/resource.h>
#include <os/proc.h>
#include "CatStemSpectrogram.hpp"
#include "CatStemCoreMLTestKernel.hpp"
@interface ProbeDelegate : UIResponder <UIApplicationDelegate>
@property(nonatomic,strong) UIWindow *window;
@property(nonatomic,strong) UILabel *label;
@end
@implementation ProbeDelegate
- (BOOL)application:(UIApplication*)application didFinishLaunchingWithOptions:(NSDictionary*)options {
    self.window=[[UIWindow alloc] initWithFrame:UIScreen.mainScreen.bounds];self.window.rootViewController=[UIViewController new];
    self.label=[[UILabel alloc]initWithFrame:CGRectInset(self.window.bounds,25,50)];self.label.numberOfLines=0;self.label.text=@"Validando o modelo completo de separação…";self.label.textColor=UIColor.whiteColor;
    [self.window.rootViewController.view addSubview:self.label];[self.window makeKeyAndVisible];application.idleTimerDisabled=YES;
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0), ^{ @autoreleasepool {
        NSURL *documents=[NSFileManager.defaultManager URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask].firstObject;
        NSURL *logURL=[documents URLByAppendingPathComponent:@"result.txt"];
        NSMutableString *log=[NSMutableString new];
        auto record=[&](NSString *line){[log appendFormat:@"%@\n",line];[log writeToURL:logURL atomically:YES encoding:NSUTF8StringEncoding error:nil];dispatch_async(dispatch_get_main_queue(),^{self.label.text=line;});};
        record([NSString stringWithFormat:@"BEGIN RAM=%llu available=%zu",NSProcessInfo.processInfo.physicalMemory,os_proc_available_memory()]);
        const NSInteger requestedMiB=[NSProcessInfo.processInfo.environment[@"CATSTEM_PROBE_PROJECT_MIB"] integerValue];
        const size_t projectMiB=requestedMiB>0?std::min<NSInteger>(requestedMiB,512):256;
        try {
            const size_t projectBytes=projectMiB * 1024 * 1024;
            std::unique_ptr<unsigned char[]> projectMemory(new unsigned char[projectBytes]);
            volatile unsigned char *projectPages=projectMemory.get();
            for(size_t page=0;page<projectBytes;page+=4096)projectPages[page]=0xA5;
            NSError *error=nil;auto format=[[AVAudioFormat alloc]initStandardFormatWithSampleRate:44100 channels:2];
            NSURL *input=[documents URLByAppendingPathComponent:@"input.wav"];
            { @autoreleasepool {
                auto writer=[[AVAudioFile alloc]initForWriting:input settings:format.settings error:&error];
                auto pcm=[[AVAudioPCMBuffer alloc]initWithPCMFormat:format frameCapacity:441000];pcm.frameLength=441000;
                for(unsigned ch=0;ch<2;ch++)for(unsigned f=0;f<441000;f++)pcm.floatChannelData[ch][f]=.12f*std::sin(2*M_PI*(ch?331:173)*f/44100)+.08f*std::sin(2*M_PI*2347*f/44100)+.02f;
                if(![writer writeFromBuffer:pcm error:&error])throw std::runtime_error(error.localizedDescription.UTF8String);
            } }
            NSURL *model=[NSBundle.mainBundle URLForResource:@"CatStemHTDemucs6Offline" withExtension:@"mlmodelc"];
            if(!model)throw std::runtime_error("Missing model");
            auto started=std::chrono::steady_clock::now();
            unsigned checks=0;
            CatStemRealtime::separateCoreMLFile(input,documents,model,[&]{
                task_vm_info_data_t info{};mach_msg_type_number_t count=TASK_VM_INFO_COUNT;task_info(mach_task_self(),TASK_VM_INFO,(task_info_t)&info,&count);
                record([NSString stringWithFormat:@"CHECK %u footprint=%llu available=%zu",++checks,info.phys_footprint,os_proc_available_memory()]);return false;
            },[&](double p){
                task_vm_info_data_t info{};mach_msg_type_number_t count=TASK_VM_INFO_COUNT;task_info(mach_task_self(),TASK_VM_INFO,(task_info_t)&info,&count);
                record([NSString stringWithFormat:@"PROGRESS %.3f footprint=%llu available=%zu",p,info.phys_footprint,os_proc_available_memory()]);
            });
            for(NSString *name in @[@"Vocal",@"Drum",@"Bass",@"Guitar",@"Other"]){auto file=[[AVAudioFile alloc]initForReading:[documents URLByAppendingPathComponent:[name stringByAppendingString:@".wav"]] error:&error];if(!file||file.length!=441000)throw std::runtime_error("Wrong output duration");}
            unsigned projectChecksum=0;
            for(size_t page=0;page<projectBytes;page+=4096)projectChecksum+=projectPages[page];
            if(projectChecksum!=(projectBytes/4096)*0xA5)throw std::runtime_error("Project memory fixture changed");
            struct rusage usage{};getrusage(RUSAGE_SELF,&usage);
            record([NSString stringWithFormat:@"PASS full-context 7.8s FP32, five files, reservedProjectMemory=%zuMiB, seconds=%.2f peakRSS=%ld",projectMiB,std::chrono::duration<double>(std::chrono::steady_clock::now()-started).count(),usage.ru_maxrss]);
        } catch(const std::exception &error){
            const bool expected=projectMiB>=384&&std::string(error.what()).find("Memória insuficiente")!=std::string::npos;
            record([NSString stringWithFormat:@"%@ %@",expected?@"PASS_MEMORY_GUARD":@"FAIL",@(error.what())]);
        }
    } });return YES;
}
@end
int main(int argc,char *argv[]){@autoreleasepool{return UIApplicationMain(argc,argv,nil,NSStringFromClass(ProbeDelegate.class));}}
