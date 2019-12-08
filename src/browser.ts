/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import *as Thrift from './thrift';
export { Thrift }

export {
  XHRConnection,
  createXHRConnection,
  createXHRClient,
} from './xhr_connection'

export { Multiplexer } from './multiplexed_protocol'

export { TWebSocketTransport } from './ws_transport';
export { TBufferedTransport } from './buffered_transport';
export { TFramedTransport } from './framed_transport';

import TJSONProtocol from 'json_protocol'
export {
  TJSONProtocol,
  TJSONProtocol as Protocol,
}

export { TBinaryProtocol } from './binary_protocol';
export { TCompactProtocol } from './compact_protocol';

export const Int64 = null;
