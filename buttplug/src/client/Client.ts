/*!
 * Buttplug JS Source Code File - Visit https://buttplug.io for more info about
 * the project. Licensed under the BSD 3-Clause license. See LICENSE file in the
 * project root for full license information.
 *
 * @copyright Copyright (c) Nonpolynomial Labs LLC. All rights reserved.
 */

"use strict";

import { ButtplugLogger } from "../core/Logging";
import { EventEmitter } from "events";
import { ButtplugClientDevice } from "./ButtplugClientDevice";
import { IButtplugClientConnector } from "./IButtplugClientConnector";
import * as Messages from "../core/Messages";
import { ButtplugDeviceException, ButtplugException,
         ButtplugInitException, ButtplugMessageException } from "../core/Exceptions";
import { ButtplugClientConnectorException } from "./ButtplugClientConnectorException";

export class ButtplugClient extends EventEmitter {
  protected _pingTimer: NodeJS.Timeout | null = null;
  protected _connector: IButtplugClientConnector | null = null;
  protected _devices: Map<number, ButtplugClientDevice> = new Map();
  protected _clientName: string;
  protected _logger = ButtplugLogger.Logger;
  protected _isScanning = false;
  // TODO This should be set on schema load
  protected _messageVersion: number = 1;

  constructor(aClientName: string = "Generic Buttplug Client") {
    super();
    this._clientName = aClientName;
    this._logger.Debug(`ButtplugClient: Client ${aClientName} created.`);
  }

  public get Connector(): IButtplugClientConnector | null {
    return this._connector;
  }

  public get Connected(): boolean {
    return this._connector !== null && this._connector.Connected;
  }

  public get Devices(): ButtplugClientDevice[] {
    // While this function doesn't actually send a message, if we don't have a
    // connector, we shouldn't have devices.
    this.CheckConnector();
    const devices: ButtplugClientDevice[] = [];
    this._devices.forEach((d, i) => {
      devices.push(d);
    });
    return devices;
  }

  public get IsScanning(): boolean {
    return this._isScanning;
  }

  public Connect = async (aConnector: IButtplugClientConnector) => {
    this._logger.Info(`ButtplugClient: Connecting using ${aConnector.constructor.name}`);
    await aConnector.Connect();
    this._connector = aConnector;
    this._connector.addListener("message", this.ParseMessages);
    this._connector.addListener("disconnect", this.DisconnectHandler);
    await this.InitializeConnection();
  }

  public Disconnect = async () => {
    this._logger.Debug(`ButtplugClient: Disconnect called`);
    this.CheckConnector();
    await this.ShutdownConnection();
    await this._connector!.Disconnect();
  }

  public StartScanning = async () => {
    this._logger.Debug(`ButtplugClient: StartScanning called`);
    this._isScanning = true;
    await this.SendMsgExpectOk(new Messages.StartScanning());
  }

  public StopScanning = async () => {
    this._logger.Debug(`ButtplugClient: StopScanning called`);
    this._isScanning = false;
    await this.SendMsgExpectOk(new Messages.StopScanning());
  }

  public RequestLog = async (aLogLevel: string) => {
    this._logger.Debug(`ButtplugClient: RequestLog called with level ${aLogLevel}`);
    await this.SendMsgExpectOk(new Messages.RequestLog(aLogLevel));
  }

  public StopAllDevices = async () => {
    this._logger.Debug(`ButtplugClient: StopAllDevices`);
    await this.SendMsgExpectOk(new Messages.StopAllDevices());
  }

  public async SendDeviceMessage(aDevice: ButtplugClientDevice,
                                 aDeviceMsg: Messages.ButtplugDeviceMessage): Promise<void> {
    this.CheckConnector();
    const dev = this._devices.get(aDevice.Index);
    if (dev === undefined) {
      throw ButtplugException.LogAndError(ButtplugDeviceException,
                                          this._logger,
                                          `Device ${aDevice.Index} not available.`);
    }
    if (dev.AllowedMessages.indexOf(aDeviceMsg.Type.name) === -1) {
      throw ButtplugException.LogAndError(ButtplugDeviceException,
                                          this._logger,
                                          `Device ${aDevice.Name} does not accept message type ${aDeviceMsg.Type}.`);
    }
    aDeviceMsg.DeviceIndex = aDevice.Index;
    await this.SendMsgExpectOk(aDeviceMsg);
  }

  public ParseMessages = (aMsgs: Messages.ButtplugMessage[]) => {
    this.ParseMessagesInternal(aMsgs);
  }

  protected DisconnectHandler = () => {
    this._logger.Info(`ButtplugClient: Disconnect event receieved.`);
    this.emit("disconnect");
  }

  protected ParseMessagesInternal(aMsgs: Messages.ButtplugMessage[]) {
    for (const x of aMsgs) {
      switch (x.constructor) {
        case Messages.Log:
          this.emit("log", x);
          break;
        case Messages.DeviceAdded:
          const addedMsg = x as Messages.DeviceAdded;
          const addedDevice = ButtplugClientDevice.fromMsg(addedMsg, this.SendDeviceMessageClosure);
          this._devices.set(addedMsg.DeviceIndex, addedDevice);
          this.emit("deviceadded", addedDevice);
          break;
        case Messages.DeviceRemoved:
          const removedMsg = x as Messages.DeviceRemoved;
          if (this._devices.has(removedMsg.DeviceIndex)) {
            const removedDevice = this._devices.get(removedMsg.DeviceIndex);
            removedDevice?.EmitDisconnected();
            this._devices.delete(removedMsg.DeviceIndex);
            this.emit("deviceremoved", removedDevice);
          }
          break;
        case Messages.ScanningFinished:
          this._isScanning = false;
          this.emit("scanningfinished", x);
          break;
      }
    }
  }

  protected InitializeConnection = async (): Promise<boolean> => {
    this.CheckConnector();
    const msg = await this.SendMessage(new Messages.RequestServerInfo(this._clientName, Messages.MESSAGE_SPEC_VERSION));
    switch (msg.constructor) {
      case Messages.ServerInfo: {
        const serverinfo = msg as Messages.ServerInfo;
        this._logger.Info(`ButtplugClient: Connected to Server ${serverinfo.ServerName}`);
        // TODO: maybe store server name, do something with message template version?
        const ping = serverinfo.MaxPingTime;
        if (serverinfo.MessageVersion < this._messageVersion) {
          // Disconnect and throw an exception explaining the version mismatch problem.
          await this._connector!.Disconnect();
          throw ButtplugException.LogAndError(
            ButtplugInitException,
            this._logger,
            "Server protocol version is older than client protocol version. Please update server.");
        }
        if (ping > 0) {
          /*
          this._pingTimer = setInterval(async () => {
            // If we've disconnected, stop trying to ping the server.
            if (!this.Connected) {
              await this.ShutdownConnection();
              return;
            }
            await this.SendMessage(new Messages.Ping());
          } , Math.round(ping / 2));
          */
        }
        await this.RequestDeviceList();
        return true;
      }
      case Messages.Error: {
        // Disconnect and throw an exception with the error message we got back.
        // This will usually only error out if we have a version mismatch that the
        // server has detected.
        await this._connector!.Disconnect();
        const err = msg as Messages.Error;
        throw ButtplugException.LogAndError(ButtplugInitException,
                                            this._logger,
                                            `Cannot connect to server. ${err.ErrorMessage}`);
      }
    }
    return false;
  }

  protected RequestDeviceList = async () => {
    this.CheckConnector();
    this._logger.Debug(`ButtplugClient: ReceiveDeviceList called`);
    const deviceList = (await this.SendMessage(new Messages.RequestDeviceList())) as Messages.DeviceList;
    deviceList.Devices.forEach((d) => {
      if (!this._devices.has(d.DeviceIndex)) {
        const device = ButtplugClientDevice.fromMsg(d, this.SendDeviceMessageClosure);
        this._logger.Debug(`ButtplugClient: Adding Device: ${device}`);
        this._devices.set(d.DeviceIndex, device);
        this.emit("deviceadded", device);
      } else {
        this._logger.Debug(`ButtplugClient: Device already added: ${d}`);
      }
    });
  }

  protected ShutdownConnection = async () => {
    await this.StopAllDevices();
    if (this._pingTimer !== null) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  protected async SendMessage(aMsg: Messages.ButtplugMessage): Promise<Messages.ButtplugMessage> {
    this.CheckConnector();
    return await this._connector!.Send(aMsg);
  }

  protected CheckConnector() {
    if (!this.Connected) {
      throw new ButtplugClientConnectorException("ButtplugClient not connected");
    }
  }

  protected SendMsgExpectOk = async (aMsg: Messages.ButtplugMessage): Promise<void> => {
    const msg = await this.SendMessage(aMsg);
    switch (msg.constructor) {
      case Messages.Ok:
        return;
      case Messages.Error:
        throw ButtplugException.FromError(msg as Messages.Error);
      default:
        throw ButtplugException.LogAndError(ButtplugMessageException,
                                            this._logger,
                                            `Message type ${msg.constructor} not handled bySendMsgExpectOk`);
    }
  }

  protected SendDeviceMessageClosure = async (aDevice: ButtplugClientDevice,
                                              aMsg: Messages.ButtplugDeviceMessage): Promise<void> => {
    await this.SendDeviceMessage(aDevice, aMsg);
  }
}