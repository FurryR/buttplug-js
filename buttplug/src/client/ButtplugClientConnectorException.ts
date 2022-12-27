/*!
 * Buttplug JS Source Code File - Visit https://buttplug.io for more info about
 * the project. Licensed under the BSD 3-Clause license. See LICENSE file in the
 * project root for full license information.
 *
 * @copyright Copyright (c) Nonpolynomial Labs LLC. All rights reserved.
 */

import { ButtplugException } from "../core/Exceptions";
import * as Messages from "../core/Messages";

export class ButtplugClientConnectorException extends ButtplugException {
  public constructor(aMessage: string) {
    super(aMessage, Messages.ErrorClass.ERROR_UNKNOWN);
  }
}
