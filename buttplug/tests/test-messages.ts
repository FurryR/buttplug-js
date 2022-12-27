import * as Messages from "../src/core/Messages";
import { ButtplugClient } from "../src/client/Client";
import { FromJSON } from "../src/core/MessageUtils";
import { SetupTestSuite } from "./utils";
import { SpeedSubcommand, VectorSubcommand, RotateSubcommand } from "../src/core/Messages";

SetupTestSuite();

describe("Message", () => {
  it("Converts ok message to json correctly",
     () => {
       const ok = new Messages.Ok(2);
       expect(ok.toJSON()).toEqual('{"Ok":{"Id":2}}');
     });
  it("Converts ok message from json correctly",
     () => {
       const jsonStr = '[{"Ok":{"Id":2}}]';
       expect(FromJSON(jsonStr)).toEqual([new Messages.Ok(2)]);
     });
  it("Converts DeviceList message from json correctly",
     () => {
       // tslint:disable-next-line:max-line-length
       const jsonStr = '[{"DeviceList":{"Id":2,"Devices": [{"DeviceIndex":0,"DeviceName":"Test","DeviceMessages":{"Ok":{},"Ping":{}}},{"DeviceIndex":1,"DeviceName":"Test1","DeviceMessages":{"Ok":{},"Ping":{}}}]}}]';
       // tslint:disable:max-line-length
       expect(FromJSON(jsonStr)).toEqual([new Messages.DeviceList([new Messages.DeviceInfo(0, "Test", {Ok: {}, Ping: {}}), new Messages.DeviceInfo(1, "Test1", {Ok: {}, Ping: {}})], 2)]);
     });
  it("Converts DeviceAdded message from json correctly",
     () => {
       const jsonStr = '[{"DeviceAdded":{"Id":0,"DeviceIndex":0,"DeviceName":"Test","DeviceMessages":{"Ok":{},"Ping":{}}}}]';
       expect(FromJSON(jsonStr)).toEqual([new Messages.DeviceAdded(0, "Test", {Ok: {}, Ping: {}})]);
     });
  it("Converts Error message from json correctly",
     () => {
       const jsonStr = '[{"Error":{"Id":2,"ErrorCode":3,"ErrorMessage":"TestError"}}]';
       expect(FromJSON(jsonStr)).toEqual([new Messages.Error("TestError",
                                                             Messages.ErrorClass.ERROR_MSG,
                                                             2)]);
     });
  it("Handles Device Commands with Subcommand arrays correctly",
     () => {
       const jsonStr = '[{"VibrateCmd":{"Id":2, "DeviceIndex": 3, "Speeds": [{ "Index": 0, "Speed": 1.0}, {"Index": 1, "Speed": 0.5}]}}]';
       expect(FromJSON(jsonStr)).toEqual([new Messages.VibrateCmd([{Index: 0, Speed: 1.0}, {Index: 1, Speed: 0.5}], 3, 2)]);
     });

  it("Handles RequestServerInfo correctly across multiple schema versions",
     () => {
       const jsonV0Str = '[{"RequestServerInfo":{"Id":2,"ClientName":"TestClient"}}]';
       expect(FromJSON(jsonV0Str)).toEqual([new Messages.RequestServerInfo("TestClient", 0, 2)]);
       const jsonV1Str = '[{"RequestServerInfo":{"Id":2,"MessageVersion":1,"ClientName":"TestClient"}}]';
       expect(FromJSON(jsonV1Str)).toEqual([new Messages.RequestServerInfo("TestClient", 1, 2)]);
     });

});