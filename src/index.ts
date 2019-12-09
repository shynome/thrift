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
  setLogFunc,
  setLogLevel,
  getLogLevel,
} from './log'

export {
  Connection,

  StdIOConnection,
  createConnection,
  createSSLConnection,
  createUDSConnection,
  createClient,

  createStdIOConnection,
  createStdIOClient,
} from './connection'

export {
  HttpConnection,
  createHttpConnection,
  createHttpUDSConnection,
  createHttpClient,
} from './http_connection'

export {
  WSConnection,
  createWSConnection,
  createWSClient,
} from './ws_connection'

export {
  XHRConnection,
  createXHRConnection,
  createXHRClient,
} from './xhr_connection'

export {
  createServer,
  createMultiplexServer,
} from './server'

export { createWebServer, } from './web_server'

export { MultiplexedProcessor, } from './multiplexed_processor';
export { Multiplexer, } from './multiplexed_protocol';

/*
 * Export transport and protocol so they can be used outside of a
 * cassandra/server context
 */
export { TFramedTransport } from './framed_transport';
export { TBufferedTransport } from './buffered_transport';
export { TBinaryProtocol } from './binary_protocol';
export { TJSONProtocol } from './json_protocol';
export { TCompactProtocol } from './compact_protocol';
