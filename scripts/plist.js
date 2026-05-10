/*
 *  scripts/plist.js
 *  Caesium
 *
 *  Created by alpha on 2025/10/22.
 *  Copyright © 2025 alphaArgon.
 */

const kKeysKey = Symbol("keys");
const kCompactKey = Symbol("compact");


const kOrderedDictHandler = {

    set(target, key, value) {
        if (typeof key !== "string") {
            return Reflect.set(target, key, value);
        }

        let hadKey = Reflect.has(target, key);
        let set = Reflect.set(target, key, value);
        if (!hadKey && set) {
            target[kKeysKey].push(key);
        }
        return set;
    },

    deleteProperty(target, key) {
        if (typeof key !== "string") {
            return Reflect.deleteProperty(target, key);
        }

        let deleted = Reflect.deleteProperty(target, key);
        if (deleted) {
            let keys = target[kKeysKey];
            let index = keys.indexOf(key);
            if (index !== -1) {keys.splice(index, 1);}
        }

        return deleted;
    },

    ownKeys(target) {
        return target[kKeysKey].slice();
    },
}


export function makeOrderedDict() {
    let dict = {__proto__: null, [kKeysKey]: []};
    return new Proxy(dict, kOrderedDictHandler);
}


export function makeCompactArray(...array) {
    array[kCompactKey] = true;
    return array;
}


export function isArrayCompact(array) {
    return array[kCompactKey] === true;
}


function skipWhitespace(string, index) {
    let regex = /(?=\S)/g;
    regex.lastIndex = index;

    return regex.exec(string) === null
        ? string.length
        : regex.lastIndex;
}


function parsePlistValue(plist, index) {
    switch (plist[index]) {
    case '"': return parsePlistQuotation(plist, index);
    case "(": return parsePlistArray(plist, index);
    case "{": return parsePlistObject(plist, index);
    default: break;
    }

    let regex = /[A-Za-z0-9_$+\/:\.\-]+/gy;
    regex.lastIndex = index;

    let match = regex.exec(plist);
    if (match === null) {
        throw new SyntaxError("Unexpected token at offset " + index);
    }

    let value = match[0];
    index = regex.lastIndex;

    if (/^[+\-]?\d+(\.\d+)?$/.test(value)) {
        value = Number(value);
    }

    return {value: value, index: index};
}


function parsePlistQuotation(plist, index) {
    if (plist[index] !== '"') {
        throw new SyntaxError("Expected '\"' at offset " + index);
    }

    let endIndex = index;

    while (true) {
        endIndex = plist.indexOf('"', endIndex + 1);
        if (endIndex === -1) {
            throw new SyntaxError("Expected '\"' at offset " + index);
        }
        
        let backslashCount = 0;
        for (let i = endIndex - 1; i >= index; --i) {
            if (plist[i] !== "\\") {break;}
            backslashCount += 1;
        }

        if (backslashCount % 2 === 0) {break;}
    }

    let string = plist.slice(index + 1, endIndex)
    string = string.replace(/\\(.)/g, (_, char) => {
        switch (char) {
        case "n": return "\n";
        case "r": return "\r";
        case "t": return "\t";
        case '"': return '"';
        case "'": return "'";
        case "\\": return "\\";
        default: return char;
        }
    });

    return {value: string, index: endIndex + 1};
}


function parsePlistArray(plist, index) {
    if (plist[index] !== "(") {
        throw new SyntaxError("Expected '(' at offset " + index);
    }

    let array = [];

    let afterParen = skipWhitespace(plist, index += 1);
    if (afterParen == index) {array[kCompactKey] = true;}
    index = afterParen;

    while (plist[index] !== ")") {
        let value = parsePlistValue(plist, index);
        array.push(value.value);

        index = skipWhitespace(plist, value.index);
        if (plist[index] === ",") {
            index = skipWhitespace(plist, index + 1);
        } else if (plist[index] !== ")") {
            throw new SyntaxError("Expected ',' at offset " + index);
        }
    }

    if (plist[index] !== ")") {
        throw new SyntaxError("Expected ')' at offset " + index);
    }

    return {value: array, index: index + 1};
}


function parsePlistObject(plist, index) {
    if (plist[index] !== "{") {
        throw new SyntaxError("Expected '{' at offset " + index);
    }

    let object = makeOrderedDict();
    
    index = skipWhitespace(plist, index + 1);
    while (plist[index] !== "}") {
        let key = parsePlistValue(plist, index);
        if (typeof key.value !== "string") {
            throw new SyntaxError("Expected string key at offset " + index);
        }

        index = skipWhitespace(plist, key.index);
        if (plist[index] !== "=") {
            throw new SyntaxError("Expected '=' at offset " + index);
        }

        index = skipWhitespace(plist, index + 1);

        let value = parsePlistValue(plist, index);
        index = skipWhitespace(plist, value.index);

        if (plist[index] !== ";") {
            throw new SyntaxError("Expected ';' at offset " + index);
        }

        index = skipWhitespace(plist, index + 1);

        object[key.value] = value.value;
    }

    if (plist[index] !== "}") {
        throw new SyntaxError("Expected '}' at offset " + index);
    }

    return {value: object, index: index + 1};
}


export function parse(plist) {
    let index = skipWhitespace(plist, 0);
    let result = parsePlistValue(plist, index);

    index = skipWhitespace(plist, result.index);
    if (index !== plist.length) {
        throw new SyntaxError("Unexpected token at offset " + index);
    }

    return result.value;
}


export function stringify(object) {
    if (typeof object === "number") {
        let string = String(object);
        if (!/^[+\-]?\d+(\.\d+)?$/.test(string)) {
            throw new TypeError(string + " cannot be represented in plist");
        }
        return string;
    }

    if (typeof object === "string") {
        if (/^[A-Za-z0-9_$+\.]+$/.test(object) && !/^[+\-]?\d+(\.\d+)?$/.test(object)) {
            return object;
        }

        return '"' + object.replace(/["\\]/g, char => {
            switch (char) {
            case '"': return '\\"';
            case "\\": return "\\\\";
            }
        }) + '"';
    }

    if (Array.isArray(object)) {
        let compact = isArrayCompact(object);
        let string = "(";
        let first = true;
        for (let value of object) {
            if (first) {first = false;}
            else {string += ",";}
            string += (compact ? "" : "\n") + stringify(value);
        }
        string += (compact ? ")" : "\n)");
        return string;
    }

    if (typeof object === "object" && object !== null) {
        let string = "{\n";
        for (let [key, value] of Object.entries(object)) {
            string += stringify(key) + " = " + stringify(value) + ";\n";
        }
        string += "}";
        return string;
    }

    throw new TypeError(typeof object + " cannot be represented in plist");
}


export default Object.freeze({parse, stringify});
