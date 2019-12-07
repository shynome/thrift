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

import util from 'util'

type LogFunc = (...r: any[]) => void
let logFunc: LogFunc = (...r) => console.log(...r);
const disabled: LogFunc = function () { };

type LogLevel = 'trace' | 'debug' | 'error' | 'warning' | 'info'
let logLevel: LogLevel = 'error'; // default level

function factory(level: LogLevel) {
  const display_level = level.toUpperCase()
  return function () {
    // better use spread syntax, but due to compatibility,
    // use legacy method here.
    var args = ['thrift: [' + display_level + '] '].concat(Array.from(arguments)) as [string, ...any[]]
    return logFunc(util.format.apply(null, args));
  };
}

let _trace: LogFunc = disabled;
let _debug: LogFunc = disabled;
let _error: LogFunc = disabled;
let _warning: LogFunc = disabled;
let _info: LogFunc = disabled;

export const setLogFunc = function (func: LogFunc) {
  logFunc = func;
};

export const setLogLevel = function (level: LogLevel) {
  _trace = _debug = _error = _warning = _info = disabled;
  logLevel = level;
  switch (logLevel) {
    case 'trace':
      _trace = factory(level);
    case 'debug':
      _debug = factory(level);
    case 'error':
      _error = factory(level);
    case 'warning':
      _warning = factory(level);
    case 'info':
      _info = factory(level);
  }
};

// set default
setLogLevel(logLevel);

export const getLogLevel = () => logLevel

export const trace: LogFunc = (...r) => _trace(...r)

export const debug: LogFunc = (...r) => _debug(...r)

export const error: LogFunc = (...r) => _error(...r)

export const warning: LogFunc = (...r) => _warning(...r)

export const info: LogFunc = (...r) => _info(...r)
