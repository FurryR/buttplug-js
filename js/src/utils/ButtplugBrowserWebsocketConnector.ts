/*!
 * Buttplug JS Source Code File - Visit https://buttplug.io for more info about
 * the project. Licensed under the BSD 3-Clause license. See LICENSE file in the
 * project root for full license information.
 *
 * @copyright Copyright (c) Nonpolynomial Labs LLC. All rights reserved.
 */

'use strict';

import { EventEmitter } from 'eventemitter3';
import { ButtplugMessage } from '../core/Messages';
import { fromJSON } from '../core/MessageUtils';

export class ButtplugBrowserWebsocketConnector extends EventEmitter {
  protected _ws: WebSocket | undefined;
  protected _websocketConstructor: typeof WebSocket | null = null;

  public constructor(private _url: string) {
    super();
  }

  public get Connected(): boolean {
    return this._ws !== undefined;
  }

  public connect = async (): Promise<void> => {
    const ws = new (this._websocketConstructor ?? WebSocket)(this._url);
    let res;
    let rej;
    const p = new Promise<void>((resolve, reject) => {
      res = resolve;
      rej = reject;
    });
    // In websockets, our error rarely tells us much, as for security reasons
    // browsers usually only throw Error Code 1006. It's up to those using this
    // library to state what the problem might be.
    const conErrorCallback = () => rej();
    ws.addEventListener('open', async () => {
      this._ws = ws;
      try {
        await this.initialize();
        this._ws.addEventListener('message', (msg) => {
          this.parseIncomingMessage(msg);
        });
        this._ws.removeEventListener('close', conErrorCallback);
        this._ws.addEventListener('close', this.disconnect);
        // TODO This doesn't really communicate the chain why our initializer failed
        res();
      } catch (e) {
        console.log(e);
        rej();
      }
    });
    ws.addEventListener('close', conErrorCallback);
    return p;
  };

  public disconnect = async (): Promise<void> => {
    if (!this.Connected) {
      return;
    }
    this._ws!.close();
    this._ws = undefined;
    this.emit('disconnect');
  };

  public sendMessage(msg: ButtplugMessage) {
    if (!this.Connected) {
      throw new Error('ButtplugBrowserWebsocketConnector not connected');
    }
    this._ws!.send('[' + msg.toJSON() + ']');
  }

  public initialize = async (): Promise<void> => {
    return Promise.resolve();
  };

  protected parseIncomingMessage(event: MessageEvent) {
    if (typeof event.data === 'string') {
      const msgs = fromJSON(event.data);
      this.emit('message', msgs);
    } else if (event.data instanceof Blob) {
      // No-op, we only use text message types.
    }
  }

  protected onReaderLoad(event: Event) {
    const msgs = fromJSON((event.target as FileReader).result);
    this.emit('message', msgs);
  }
}
