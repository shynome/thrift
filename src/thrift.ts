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
import util from 'util';

export const enum Type {
  STOP = 0,
  VOID = 1,
  BOOL = 2,
  BYTE = 3,
  I08 = 3,
  DOUBLE = 4,
  I16 = 6,
  I32 = 8,
  I64 = 10,
  STRING = 11,
  UTF7 = 11,
  STRUCT = 12,
  MAP = 13,
  SET = 14,
  LIST = 15,
  UTF8 = 16,
  UTF16 = 17
};

export const enum MessageType {
  CALL = 1,
  REPLY = 2,
  EXCEPTION = 3,
  ONEWAY = 4
};

export class TException extends Error {
};

export const enum TApplicationExceptionType {
  UNKNOWN = 0,
  UNKNOWN_METHOD = 1,
  INVALID_MESSAGE_TYPE = 2,
  WRONG_METHOD_NAME = 3,
  BAD_SEQUENCE_ID = 4,
  MISSING_RESULT = 5,
  INTERNAL_ERROR = 6,
  PROTOCOL_ERROR = 7,
  INVALID_TRANSFORM = 8,
  INVALID_PROTOCOL = 9,
  UNSUPPORTED_CLIENT_TYPE = 10
};

export class TApplicationException extends TException {
  public type: TApplicationExceptionType
  constructor(
    type: TApplicationExceptionType = TApplicationExceptionType.UNKNOWN,
    message?: string,
  ) {
    super()
    this.type = type
    if (message) {
      this.message = message
    }
  };
  code?: number
  public read(input: any) {
    var ftype;
    var ret = input.readStructBegin('TApplicationException');

    while (1) {
      ret = input.readFieldBegin();
      if (ret.ftype == Type.STOP)
        break;

      switch (ret.fid) {
        case 1:
          if (ret.ftype == Type.STRING) {
            ret = input.readString();
            this.message = ret;
          } else {
            ret = input.skip(ret.ftype);
          }
          break;
        case 2:
          if (ret.ftype == Type.I32) {
            ret = input.readI32();
            this.type = ret;
          } else {
            ret = input.skip(ret.ftype);
          }
          break;
        default:
          ret = input.skip(ret.ftype);
          break;
      }
      input.readFieldEnd();
    }
    input.readStructEnd();
  };
  public write(output: any) {
    output.writeStructBegin('TApplicationException');

    if (this.message) {
      output.writeFieldBegin('message', Type.STRING, 1);
      output.writeString(this.message);
      output.writeFieldEnd();
    }

    if (this.code) {
      output.writeFieldBegin('type', Type.I32, 2);
      output.writeI32(this.code);
      output.writeFieldEnd();
    }

    output.writeFieldStop();
    output.writeStructEnd();
  };
}

export const enum TProtocolExceptionType {
  UNKNOWN = 0,
  INVALID_DATA = 1,
  NEGATIVE_SIZE = 2,
  SIZE_LIMIT = 3,
  BAD_VERSION = 4,
  NOT_IMPLEMENTED = 5,
  DEPTH_LIMIT = 6
};

export class TProtocolException extends Error {
  constructor(
    public type: TProtocolExceptionType,
    public message: string,
  ) {
    super()
  };

}

export const objectLength = function (obj: any) {
  return Object.keys(obj).length;
};

export const inherits = function (constructor: any, superConstructor: any) {
  util.inherits(constructor, superConstructor);
};

export const copyList = function (lst: any[], types: any) {

  if (!lst) { return lst; }

  var type;

  if (types.shift === undefined) {
    type = types;
  }
  else {
    type = types[0];
  }
  var Type = type;

  var len = lst.length, result = [], i, val;
  for (i = 0; i < len; i++) {
    val = lst[i];
    if (type === null) {
      result.push(val);
    }
    else if (type === copyMap || type === copyList) {
      result.push(type(val, types.slice(1)));
    }
    else {
      result.push(new Type(val));
    }
  }
  return result;
};

export const copyMap = function (obj: any, types: any) {

  if (!obj) { return obj; }

  var type;

  if (types.shift === undefined) {
    type = types;
  }
  else {
    type = types[0];
  }
  var Type = type;

  var result: any = {}, val;
  for (var prop in obj) {
    if (obj.hasOwnProperty(prop)) {
      val = obj[prop];
      if (type === null) {
        result[prop] = val;
      }
      else if (type === copyMap || type === copyList) {
        result[prop] = type(val, types.slice(1));
      }
      else {
        result[prop] = new Type(val);
      }
    }
  }
  return result;
};
