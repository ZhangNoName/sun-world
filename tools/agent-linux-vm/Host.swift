// Explicit owned test VM: no network, disks or host directory shares.
import Foundation
import Virtualization
import Darwin

var machine: VZVirtualMachine?
var started = false
var stopping = false
var finished = false
var stopReason: String?

func finish(_ reason: String, _ success: Bool) {
    guard !finished else { return }
    finished = true
    let stopped = machine == nil || machine?.state == .stopped
    let message = "\nSW_LINUX_HOST_RESULT {\"version\":\"sun-world-linux-host-result/1\",\"started\":\(started),\"stopped\":\(stopped),\"reason\":\"\(reason)\"}\n"
    FileHandle.standardError.write(Data(message.utf8))
    exit(success && stopped ? 0 : 1)
}

func stop(_ reason: String) {
    guard !stopping && !finished else { return }
    stopping = true
    stopReason = reason
    guard let vm = machine, vm.state != .stopped else {
        finish(reason, false)
        return
    }
    vm.stop { _ in finish(reason, false) }
}

final class GuestDelegate: NSObject, VZVirtualMachineDelegate {
    func guestDidStop(_ virtualMachine: VZVirtualMachine) {
        finish(stopReason ?? "completed", stopReason == nil)
    }
    func virtualMachine(_ virtualMachine: VZVirtualMachine, didStopWithError error: Error) {
        finish("guest_error", false)
    }
}

let official = CommandLine.arguments.count == 6 && CommandLine.arguments[3] == "official"
guard ([3, 4].contains(CommandLine.arguments.count) || official),
      CommandLine.arguments.count == 3 || official || ["containment", "gateway", "stack", "api-restart"].contains(CommandLine.arguments[3]),
      VZVirtualMachine.isSupported else {
    finish("configuration_invalid", false)
    exit(1)
}
let configuration = VZVirtualMachineConfiguration()
configuration.cpuCount = 2
let apiRestart = CommandLine.arguments.count == 4 && CommandLine.arguments[3] == "api-restart"
let stack = official || apiRestart || CommandLine.arguments.count == 4 && CommandLine.arguments[3] == "stack"
let gateway = stack || CommandLine.arguments.count == 4 && CommandLine.arguments[3] == "gateway"
configuration.memorySize = (stack ? 8 : gateway ? 4 : 2) * 1024 * 1024 * 1024
configuration.platform = VZGenericPlatformConfiguration()
let boot = VZLinuxBootLoader(kernelURL: URL(fileURLWithPath: CommandLine.arguments[1]))
boot.initialRamdiskURL = URL(fileURLWithPath: CommandLine.arguments[2])
let epoch = Int(Date().timeIntervalSince1970)
let containment = CommandLine.arguments.count >= 4 ? 1 : 0
boot.commandLine = "console=hvc0 rdinit=/init panic=0 loglevel=3 sw_epoch=\(epoch) sw_containment=\(containment) sw_gateway=\(gateway ? 1 : 0) sw_stack=\(stack ? 1 : 0) sw_official=\(official ? 1 : 0) sw_api_restart=\(apiRestart ? 1 : 0)"
configuration.bootLoader = boot
let console = VZVirtioConsoleDeviceSerialPortConfiguration()
console.attachment = VZFileHandleSerialPortAttachment(fileHandleForReading: nil, fileHandleForWriting: .standardOutput)
configuration.serialPorts = [console]
if official {
    guard let input = Int32(CommandLine.arguments[4]), let output = Int32(CommandLine.arguments[5]),
          input > 2, output > 2, input != output else { finish("configuration_invalid", false); exit(1) }
    var inputInfo = stat(), outputInfo = stat()
    guard fstat(input, &inputInfo) == 0, fstat(output, &outputInfo) == 0,
          inputInfo.st_mode & S_IFMT == S_IFIFO, outputInfo.st_mode & S_IFMT == S_IFIFO,
          fcntl(input, F_GETFL) & O_ACCMODE == O_RDONLY,
          fcntl(output, F_GETFL) & O_ACCMODE == O_WRONLY else { finish("configuration_invalid", false); exit(1) }
    let control = VZVirtioConsoleDeviceSerialPortConfiguration()
    control.attachment = VZFileHandleSerialPortAttachment(
        fileHandleForReading: FileHandle(fileDescriptor: input, closeOnDealloc: false),
        fileHandleForWriting: FileHandle(fileDescriptor: output, closeOnDealloc: false))
    configuration.serialPorts.append(control)
}
configuration.entropyDevices = [VZVirtioEntropyDeviceConfiguration()]
configuration.networkDevices = []
configuration.storageDevices = []
configuration.directorySharingDevices = []
configuration.graphicsDevices = []

let delegate = GuestDelegate()
do {
    try configuration.validate()
    machine = VZVirtualMachine(configuration: configuration)
    machine?.delegate = delegate
} catch {
    finish("configuration_invalid", false)
}
let signals = [SIGINT, SIGTERM].map { number -> DispatchSourceSignal in
    signal(number, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: number, queue: .main)
    source.setEventHandler { stop("interrupted") }
    source.resume()
    return source
}
DispatchQueue.main.asyncAfter(deadline: .now() + (official ? 600 : apiRestart ? 420 : stack ? 300 : 90)) { stop("deadline") }
machine?.start { result in
    switch result {
    case .success: started = true
    case .failure: finish("startup_failed", false)
    }
}
RunLoop.main.run()
