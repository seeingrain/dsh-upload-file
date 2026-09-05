import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { mkdir, rename, rm, stat, unlink } from "node:fs/promises";
import { basename, join, normalize, sep } from "node:path";
import { pipeline } from "node:stream/promises";
//#region node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.3/node_modules/@deepseek-ai/cosmokit/lib/index.js
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true for non-array object values. */
function isPlainObject(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value) => is(type, value);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
/** Binary source detection and base64/hex conversion helpers. */
var Binary;
(function(Binary) {
	Binary.is = isArrayBufferLike;
	Binary.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	Binary.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	Binary.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	Binary.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	Binary.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	Binary.fromHex = fromHex;
})(Binary || (Binary = {}));
Binary.fromBase64;
Binary.toBase64;
Binary.fromHex;
Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result = [];
		refs.set(source, result);
		source.forEach((value, index) => {
			result[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/** Deeply compare arrays, dates, regexps, buffers, and plain object fields. */
function deepEqual(a, b, strict) {
	if (a === b) return true;
	if (!strict && isNullable(a) && isNullable(b)) return true;
	if (typeof a !== typeof b) return false;
	if (typeof a !== "object") return false;
	if (!a || !b) return false;
	function check(test, then) {
		return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
	}
	return check(Array.isArray, (a, b) => a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
		if (a.byteLength !== b.byteLength) return false;
		const viewA = new Uint8Array(a);
		const viewB = new Uint8Array(b);
		for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
		return true;
	}) ?? Object.keys({
		...a,
		...b
	}).every((key) => deepEqual(a[key], b[key], strict));
}
/** Time constants plus parsing and formatting helpers. */
var Time;
(function(Time) {
	Time.millisecond = 1;
	Time.second = 1e3;
	Time.minute = Time.second * 60;
	Time.hour = Time.minute * 60;
	Time.day = Time.hour * 24;
	Time.week = Time.day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	Time.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	Time.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / Time.minute - offset) / 1440);
	}
	Time.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * Time.day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * Time.minute);
	}
	Time.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * Time.week || 0) + (parseFloat(capture[2]) * Time.day || 0) + (parseFloat(capture[3]) * Time.hour || 0) + (parseFloat(capture[4]) * Time.minute || 0) + (parseFloat(capture[5]) * Time.second || 0);
	}
	Time.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	Time.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= Time.day - Time.hour / 2) return Math.round(ms / Time.day) + "d";
		else if (abs >= Time.hour - Time.minute / 2) return Math.round(ms / Time.hour) + "h";
		else if (abs >= Time.minute - Time.second / 2) return Math.round(ms / Time.minute) + "m";
		else if (abs >= Time.second) return Math.round(ms / Time.second) + "s";
		return ms + "ms";
	}
	Time.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	Time.toDigits = toDigits;
	function template(template, time = /* @__PURE__ */ new Date()) {
		return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	Time.template = template;
})(Time || (Time = {}));
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+schemastery@3.18.2/node_modules/@deepseek-ai/schemastery/lib/index.mjs
const kSchema = Symbol.for("schemastery");
const kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
	options;
	name = "ValidationError";
	constructor(message, options) {
		let prefix = "$";
		for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
		else if (typeof segment === "number") prefix += "[" + segment + "]";
		else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
		if (prefix.startsWith(".")) prefix = prefix.slice(1);
		super((prefix === "$" ? "" : `${prefix} `) + message);
		this.options = options;
	}
	static is(error) {
		return !!error?.[kValidationError];
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
const Schema = function(options) {
	const schema = function(data, options = {}) {
		return Schema.resolve(data, schema, options)[0];
	};
	if (options.refs) {
		const refs = mapValues(options.refs, (options) => new Schema(options));
		const getRef = (uid) => refs[uid];
		for (const key in refs) {
			const options = refs[key];
			options.sKey = getRef(options.sKey);
			options.inner = getRef(options.inner);
			options.list = options.list && options.list.map(getRef);
			options.dict = options.dict && mapValues(options.dict, getRef);
		}
		return refs[options.uid];
	}
	Object.assign(schema, options);
	if (typeof schema.callback === "string") try {
		schema.callback = new Function("return " + schema.callback)();
	} catch {}
	Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
	Object.setPrototypeOf(schema, Schema.prototype);
	schema.meta ||= {};
	schema.toString = schema.toString.bind(schema);
	return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
	return {
		version: 1,
		vendor: "schemastery",
		validate: (value) => {
			try {
				return { value: Schema.resolve(value, this, {})[0] };
			} catch (error) {
				if (ValidationError.is(error)) return { issues: [{
					message: error.message,
					path: error.options.path
				}] };
				throw error;
			}
		}
	};
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
	if (globalThis.__schemastery_refs__) {
		globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
		return this.uid;
	}
	globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
	globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
	const result = {
		uid: this.uid,
		refs: globalThis.__schemastery_refs__
	};
	globalThis.__schemastery_refs__ = void 0;
	return result;
};
Schema.prototype.set = function set(key, value) {
	this.dict[key] = value;
	return this;
};
Schema.prototype.push = function push(value) {
	this.list.push(value);
	return this;
};
function mergeDesc(original, messages) {
	const result = typeof original === "string" ? { "": original } : { ...original };
	for (const locale in messages) {
		const value = messages[locale];
		if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
		else if (typeof value === "string") result[locale] = value;
	}
	return result;
}
function getInner(value) {
	return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
	return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
	const schema = Schema(this);
	const desc = mergeDesc(schema.meta.description, messages);
	if (Object.keys(desc).length) schema.meta.description = desc;
	if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
		return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
	});
	if (schema.list) schema.list = schema.list.map((inner, index) => {
		return inner.i18n(mapValues(messages, (data = {}) => {
			if (Array.isArray(getInner(data))) return getInner(data)[index];
			if (Array.isArray(data)) return data[index];
			return extractKeys(data);
		}));
	});
	if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
		if (getInner(data)) return getInner(data);
		return extractKeys(data);
	}));
	if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
	return schema;
};
Schema.prototype.extra = function extra(key, value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
};
for (const key of [
	"required",
	"disabled",
	"collapse",
	"hidden",
	"loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.deprecated = function deprecated() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "deprecated",
		type: "danger"
	});
	return schema;
};
Schema.prototype.experimental = function experimental() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "experimental",
		type: "warning"
	});
	return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
	const schema = Schema(this);
	const pattern = pick(regexp, ["source", "flags"]);
	schema.meta = {
		...schema.meta,
		pattern
	};
	return schema;
};
Schema.prototype.simplify = function simplify(value) {
	if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
	if (isNullable(value)) return value;
	if (this.type === "object" || this.type === "dict") {
		const result = {};
		for (const key in value) {
			const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
			if (this.type === "dict" || !isNullable(item)) result[key] = item;
		}
		if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
		return result;
	} else if (this.type === "array" || this.type === "tuple") {
		const result = [];
		value.forEach((value, index) => {
			const schema = this.type === "array" ? this.inner : this.list[index];
			const item = schema ? schema.simplify(value) : value;
			result.push(item);
		});
		return result;
	} else if (this.type === "intersect") {
		const result = {};
		for (const item of this.list) Object.assign(result, item.simplify(value));
		return result;
	} else if (this.type === "union") for (const schema of this.list) try {
		Schema.resolve(value, schema, {});
		return schema.simplify(value);
	} catch {}
	return value;
};
Schema.prototype.toString = function toString(inline) {
	return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		role,
		extra
	};
	return schema;
};
for (const key of [
	"default",
	"link",
	"comment",
	"description",
	"max",
	"min",
	"step"
]) Object.assign(Schema.prototype, { [key](value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
const resolvers = {};
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
	if (options.ignore?.(data, schema)) return [data];
	if (isNullable(data) && schema.type !== "lazy") {
		if (schema.meta.required) throw new ValidationError(`missing required value`, options);
		let current = schema;
		let fallback = schema.meta.default;
		while (current?.type === "intersect" && isNullable(fallback)) {
			current = current.list[0];
			fallback = current?.meta.default;
		}
		if (isNullable(fallback)) return [data];
		data = clone(fallback);
	}
	const callback = resolvers[schema.type];
	if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
	try {
		return callback(data, schema, options, strict);
	} catch (error) {
		if (!schema.meta.loose) throw error;
		return [schema.meta.default];
	}
};
Schema.from = function from(source) {
	if (isNullable(source)) return Schema.any();
	else if ([
		"string",
		"number",
		"boolean"
	].includes(typeof source)) return Schema.const(source).required();
	else if (source[kSchema]) return source;
	else if (typeof source === "function") switch (source) {
		case String: return Schema.string().required();
		case Number: return Schema.number().required();
		case Boolean: return Schema.boolean().required();
		case Function: return Schema.function().required();
		default: return Schema.is(source).required();
	}
	else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
	const toJSON = () => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return schema.inner.toJSON();
	};
	const schema = new Schema({
		type: "lazy",
		builder,
		inner: { toJSON }
	});
	return schema;
};
Schema.natural = function natural() {
	return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
	return Schema.number().step(.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
	return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
		const date = new Date(value);
		if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
		return date;
	}, true)]);
};
Schema.regExp = function regExp(flag = "") {
	return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
		try {
			return new RegExp(value, flag);
		} catch (e) {
			throw new ValidationError(e.message, options);
		}
	}, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
	return Schema.union([
		Schema.is(ArrayBuffer),
		Schema.is(SharedArrayBuffer),
		Schema.transform(Schema.any(), (value, options) => {
			if (Binary.isSource(value)) return Binary.fromSource(value);
			throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
		}, true),
		...encoding ? [Schema.transform(Schema.string(), (value, options) => {
			try {
				return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)] : []
	]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
	if (!schema.inner[kSchema]) {
		schema.inner = schema.builder();
		schema.inner.meta = {
			...schema.meta,
			...schema.inner.meta
		};
	}
	return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
	return [data];
});
Schema.extend("never", (data, _, options) => {
	throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
	if (deepEqual(data, value)) return [value];
	throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
	const { max = Infinity, min = -Infinity } = meta;
	if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
	if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
	if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
	if (meta.pattern) {
		const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
		if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
	}
	checkWithinRange(data.length, meta, "string length", options);
	return [data];
});
function decimalShift(data, digits) {
	const str = data.toString();
	if (str.includes("e")) return data * Math.pow(10, digits);
	const index = str.indexOf(".");
	if (index === -1) return data * Math.pow(10, digits);
	const frac = str.slice(index + 1);
	const integer = str.slice(0, index);
	if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
	return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
	step = Math.abs(step);
	if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
	const index = step.toString().indexOf(".");
	const digits = step.toString().slice(index + 1).length;
	return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
	if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
	checkWithinRange(data, meta, "number", options);
	const { step } = meta;
	if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
	return [data];
});
Schema.extend("boolean", (data, _, options) => {
	if (typeof data === "boolean") return [data];
	throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
	let value = 0, keys = [];
	if (typeof data === "number") {
		value = data;
		for (const key in bits) if (data & bits[key]) keys.push(key);
	} else if (Array.isArray(data)) {
		keys = data;
		for (const key of keys) {
			if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
			if (key in bits) value |= bits[key];
		}
	} else throw new ValidationError(`expected number or array but got ${data}`, options);
	if (value === meta.default) return [value];
	return [value, keys];
});
Schema.extend("function", (data, _, options) => {
	if (typeof data === "function") return [data];
	throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
	if (typeof constructor === "function") {
		if (data instanceof constructor) return [data];
		throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
	} else {
		if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		let prototype = Object.getPrototypeOf(data);
		while (prototype) {
			if (prototype.constructor?.name === constructor) return [data];
			prototype = Object.getPrototypeOf(prototype);
		}
		throw new ValidationError(`expected ${constructor} but got ${data}`, options);
	}
});
function property(data, key, schema, options) {
	try {
		const [value, adapted] = Schema.resolve(data[key], schema, {
			...options,
			path: [...options.path || [], key]
		});
		if (adapted !== void 0) data[key] = adapted;
		return value;
	} catch (e) {
		if (!options?.autofix) throw e;
		delete data[key];
		return schema.meta.default;
	}
}
Schema.extend("array", (data, { inner, meta }, options) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
	return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in data) {
		let rKey;
		try {
			rKey = Schema.resolve(key, sKey, options)[0];
		} catch (error) {
			if (strict) continue;
			throw error;
		}
		result[rKey] = property(data, key, inner, options);
		data[rKey] = data[key];
		if (key !== rKey) delete data[key];
	}
	return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	const result = list.map((inner, index) => property(data, index, inner, options));
	if (strict) return [result];
	result.push(...data.slice(list.length));
	return [result];
});
function merge(result, data) {
	for (const key in data) {
		if (key in result) continue;
		result[key] = data[key];
	}
}
Schema.extend("object", (data, { dict }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in dict) {
		const value = property(data, key, dict[key], options);
		if (!isNullable(value) || key in data) result[key] = value;
	}
	if (!strict) merge(result, data);
	return [result];
});
Schema.extend("union", (data, { list, toString }, options, strict) => {
	const messages = [];
	for (const inner of list) try {
		return Schema.resolve(data, inner, options, strict);
	} catch (error) {
		messages.push(error);
	}
	throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString }, options, strict) => {
	if (!list.length) return [data];
	let result;
	for (const inner of list) {
		const value = Schema.resolve(data, inner, options, true)[0];
		if (isNullable(value)) continue;
		if (isNullable(result)) result = value;
		else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		else if (typeof value === "object") merge(result ??= {}, value);
		else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	}
	if (!strict && isPlainObject(data)) merge(result, data);
	return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
	const [result, adapted = data] = Schema.resolve(data, inner, options, true);
	if (preserve) return [callback(result)];
	else return [callback(result), callback(adapted)];
});
const formatters = {};
function defineMethod(name, keys, format) {
	formatters[name] = format;
	Object.assign(Schema, { [name](...args) {
		const schema = new Schema({ type: name });
		keys.forEach((key, index) => {
			switch (key) {
				case "sKey":
					schema.sKey = args[index] ?? Schema.string();
					break;
				case "inner":
					schema.inner = Schema.from(args[index]);
					break;
				case "list":
					schema.list = args[index].map(Schema.from);
					break;
				case "dict":
					schema.dict = mapValues(args[index], Schema.from);
					break;
				case "bits":
					schema.bits = {};
					for (const key in args[index]) {
						if (typeof args[index][key] !== "number") continue;
						schema.bits[key] = args[index][key];
					}
					break;
				case "callback": {
					const callback = schema.callback = args[index];
					callback["toJSON"] ||= () => callback.toString();
					break;
				}
				case "constructor": {
					const constructor = schema.constructor = args[index];
					if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
					break;
				}
				default: schema[key] = args[index];
			}
		});
		if (name === "object" || name === "dict") schema.meta.default = {};
		else if (name === "array" || name === "tuple") schema.meta.default = [];
		else if (name === "bitset") schema.meta.default = 0;
		return schema;
	} });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
	if (typeof constructor === "function") return constructor.name;
	else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
	if (Object.keys(dict).length === 0) return "{}";
	return `{ ${Object.entries(dict).map(([key, inner]) => {
		return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
	}).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
	const result = list.map(({ toString: format }) => format()).join(" | ");
	return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
	return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
	"inner",
	"callback",
	"preserve"
], ({ inner }, isInner) => inner.toString(isInner));
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-timeout@0.1.0-rc.8_@deepseek-ai+cordis@4.0.1_@deepseek-ai+dsh-invarian_95b020dd1e69a53c4e35530fca012a2d/node_modules/@deepseek-ai/dsh-timeout/lib/index.js
/** Largest delay Node schedules without clamping it to one millisecond. */
const MAX_TIMER_DELAY_MS = 2147483647;
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-llm@0.1.0-rc.8_@deepseek-ai+cordis@4.0.1_@deepseek-ai+dsh-attachment@0_61618b2248b445cfdee05dd35956012b/node_modules/@deepseek-ai/dsh-llm/lib/index.js
/**
* Canonical provider-neutral code for a response that completed normally but
* carried no content blocks at all. Providers occasionally emit a degenerate
* completion (a terminal stop with zero output); adapters classify it as this
* failure instead of yielding an empty assistant message, because an empty
* message silently ends the turn with nothing for the user or the loop to act
* on. The attempt produced nothing durable, so retry policy treats it as safe
* to repeat.
*/
const EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";
new RegExp(String.raw`(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-]` + String.raw`(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])`, "i");
new RegExp(String.raw`\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?` + String.raw`too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?` + String.raw`(?:model(?:'s)?\s+)?context(?:\s+window)?\b`, "i");
new RegExp(String.raw`\b(?:input|prompt|request|messages?)\b.{0,40}` + String.raw`\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}` + String.raw`\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b`, "i");
/**
* Provider-owned request-retry policy configuration and resolution.
*
* Adapters expose one resolved policy per registered provider route; the
* optional dsh-llm-retry plugin executes it on the agent's failed-step extension point.
*
* @module @deepseek-ai/dsh-llm/retry-policy
*/
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 1e4;
const DEFAULT_JITTER_RATIO = .1;
const DEFAULT_RETRYABLE_CODES = Object.freeze([
	EMPTY_RESPONSE_CODE,
	"RATE_LIMIT",
	"SERVER",
	"TIMEOUT",
	"TRANSPORT"
]);
const backoffSchema = Schema.object({
	initialDelayMs: Schema.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_INITIAL_DELAY_MS),
	maxDelayMs: Schema.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_MAX_DELAY_MS),
	jitterRatio: Schema.number().min(0).max(1).default(DEFAULT_JITTER_RATIO)
});
const normalPolicySchema = Schema.object({
	mode: Schema.const("normal").required(),
	maxRetries: Schema.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_RETRIES),
	retryableCodes: Schema.array(Schema.string()).default([...DEFAULT_RETRYABLE_CODES]),
	backoff: backoffSchema
});
const alwaysPolicySchema = Schema.object({
	mode: Schema.const("always").required(),
	backoff: backoffSchema
});
Schema.union([normalPolicySchema, alwaysPolicySchema]);
/**
* Centralize the non-secret product identity every provider request sends as `User-Agent`, keeping
* adapters from drifting. See
* `.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md`.
*
* App-attribution vocabulary for provider requests.
* @module @deepseek-ai/dsh-llm/attribution
*/
const { version } = createRequire(import.meta.url)("../package.json");
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-session@0.1.0-rc.6_fbdb1d988541b64ff002d18c4ded7293/node_modules/@deepseek-ai/dsh-session/lib/index.js
/**
* Brand a string as a {@link SessionId}.
* @param id - the raw session id string.
* @returns the same string, branded (a compile-time cast — no runtime cost).
*/
function SessionId(id) {
	return id;
}
//#endregion
//#region src/index.ts
/**
* dsh-upload-file — host half.
*
* Stores files in the session workspace's `.uploaded_files/<sessionId>/`
* directory (hidden by design). The filesystem IS the registry: no JSON
* index, no display-name
* indirection — the filename is the single identity. The per-session system
* prompt points the model at this session's own directory, so same-named
* files from different sessions never collide.
*
* Routes (prefix /dsh-upload-file/v1):
*   POST   /uploads/prepare   {sessionId, name, size}
*   PUT    /uploads/<id>      application/octet-stream  (streamed, sha256 inline)
*   POST   /uploads/<id>/commit {expectedSha256}
*   DELETE /uploads/<id>
*   GET    /sessions/<sessionId>/attachments          (directory listing + stat)
*   GET    /attachments/content?sessionId&name         (download / open)
*   DELETE /sessions/<sessionId>/attachments?name=     (delete a committed upload)
*/
/** Services required before mounting. */
const inject = [
	"agents",
	"webServer",
	"systemPrompt"
];
const API_PREFIX = "/dsh-upload-file/v1";
/** 隐藏目录：dot 前缀让目录不出现在文件管理器/备份工具的显眼位置 */
const UPLOAD_DIR_NAME = ".uploaded_files";
/** v0.4.0 之前的目录名，用于一次性迁移 */
const LEGACY_UPLOAD_DIR_NAME = "uploaded_files";
const MAX_FILE_BYTES = 8589934592;
/** Session ids arrive as `session-<uuid>` (persisted) or bare `<uuid>`; the
*  `session-` prefix is part of the id, not a formatting artifact. */
const SESSION_ID_RE = /^(?:session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Per-session upload directory: <workspace>/.uploaded_files/<sessionId>.
*  首次访问时若发现旧版 `uploaded_files/<sessionId>` 存在且新目录不存在，
*  整体 rename 迁移（同分区原子操作）；新目录已存在则不合并，避免复杂化。 */
function sessionUploadDir(workspace, sessionId) {
	const ws = String(workspace);
	const dir = join(ws, UPLOAD_DIR_NAME, String(sessionId));
	try {
		const legacy = join(ws, LEGACY_UPLOAD_DIR_NAME, String(sessionId));
		if (existsSync(legacy) && !existsSync(dir)) {
			mkdirSync(join(ws, UPLOAD_DIR_NAME), { recursive: true });
			renameSync(legacy, dir);
		}
	} catch {}
	return dir;
}
/** Sanitize a display name into a safe filesystem basename. */
function safeBasename(name) {
	const cleaned = basename(String(name ?? "").replaceAll("\\", "/")).trim().replace(/[\u0000-\u001f\u007f/\\:]/g, "_").replace(/^\.+/, "");
	return cleaned.length > 0 ? cleaned : "file";
}
/** Resolve a non-colliding filename inside dir: the desired name as-is, or
*  desired_1, desired_2, … (numeric suffix inserted before the extension).
*  The chosen name becomes the file's identity, so it is returned as-is. */
function uniqueNameIn(dir, desired) {
	if (!readdirSyncSafe(dir).includes(desired)) return desired;
	const dot = desired.lastIndexOf(".");
	const base = dot > 0 ? desired.slice(0, dot) : desired;
	const ext = dot > 0 ? desired.slice(dot) : "";
	let n = 1;
	let next;
	do {
		next = `${base}_${n}${ext}`;
		n += 1;
	} while (readdirSyncSafe(dir).includes(next));
	return next;
}
function readdirSyncSafe(dir) {
	try {
		return readdirSync(dir);
	} catch {
		return [];
	}
}
function readBody(req, maxBytes = 65536) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > maxBytes) {
				reject(/* @__PURE__ */ new Error("payload too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}
function writeJson(res, status, value) {
	const body = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(body),
		"cache-control": "no-store"
	});
	res.end(body);
}
function writeError(res, status, code, message) {
	writeJson(res, status, { error: {
		code,
		message
	} });
}
function sendFile(res, absPath, displayName) {
	const type = mimeFor(basename(absPath).slice(basename(absPath).lastIndexOf("."))).toLowerCase();
	res.writeHead(200, {
		"content-type": type,
		"content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(displayName)}`,
		"cache-control": "no-store"
	});
	pipeline(createReadStream(absPath), res).catch(() => {
		res.destroy();
	});
}
function mimeFor(ext) {
	return {
		".pdf": "application/pdf",
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".webp": "image/webp",
		".txt": "text/plain; charset=utf-8",
		".md": "text/markdown; charset=utf-8",
		".csv": "text/csv; charset=utf-8",
		".json": "application/json",
		".html": "text/html; charset=utf-8",
		".htm": "text/html; charset=utf-8",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		".zip": "application/zip",
		".mp4": "video/mp4",
		".mp3": "audio/mpeg"
	}[ext] ?? "application/octet-stream";
}
const THUMBS_DIR_NAME = ".thumbs";
const THUMB_MAX_BYTES = 10240;
const THUMB_MAX_DIM = 160;
function runCmd(cmd, args, timeoutMs = 3e4) {
	return new Promise((resolve) => {
		execFile(cmd, args, { timeout: timeoutMs }, (err) => resolve(err ? null : true));
	});
}
/** 按扩展名判定可生成缩略图的家族；null = 不支持（客户端回落）。 */
function thumbFamily(name) {
	const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
	if ([
		"png",
		"jpg",
		"jpeg",
		"gif",
		"webp",
		"bmp",
		"ico"
	].includes(ext)) return "image";
	if ([
		"mp4",
		"webm",
		"mov",
		"mkv",
		"avi",
		"m4v",
		"ogv"
	].includes(ext)) return "video";
	if (ext === "pdf") return "pdf";
	return null;
}
/** 生成器注册表：family → 生成函数。null = 预留接口（暂不生成）。 */
const THUMB_GENERATORS = {
	image: genImageOrVideoThumb,
	video: genImageOrVideoThumb,
	pdf: genPdfThumb,
	word: null,
	excel: null,
	powerpoint: null
};
async function genImageOrVideoThumb(src, dst, thumbsDir, name) {
	const seek = await videoSeekArgs(src);
	const scaleFilter = `scale='if(gt(iw,ih),${THUMB_MAX_DIM},-2)':'if(gt(iw,ih),-2,${THUMB_MAX_DIM})'`;
	for (const q of [
		4,
		6,
		9,
		13
	]) {
		await runCmd("ffmpeg", [
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			...seek,
			"-i",
			src,
			"-frames:v",
			"1",
			"-vf",
			scaleFilter,
			"-q:v",
			String(q),
			dst
		]);
		let sz = 0;
		try {
			sz = (await stat(dst)).size;
		} catch {}
		if (sz > 0 && (sz <= THUMB_MAX_BYTES || q === 13)) return true;
		await rm(dst, { force: true }).catch(() => {});
	}
	return false;
}
/** 视频 seek 参数：5% 处（避开片头黑场），上限 60s；ffprobe 失败则不 seek。 */
async function videoSeekArgs(src) {
	try {
		const out = await new Promise((resolve) => {
			execFile("ffprobe", [
				"-v",
				"error",
				"-show_entries",
				"format=duration",
				"-of",
				"default=nw=1:nk=1",
				src
			], { timeout: 15e3 }, (err, so) => resolve(err ? "" : so));
		});
		const dur = parseFloat(String(out).trim());
		if (Number.isFinite(dur) && dur > 0) return ["-ss", String(Math.min(Math.max(dur * .05, .05), 60)).toFixed(2)];
	} catch {}
	return [];
}
async function genPdfThumb(src, dst, thumbsDir) {
	const prefix = join(thumbsDir, `gen-${randomUUID()}`);
	let last = null;
	try {
		for (const q of [
			80,
			65,
			50,
			35
		]) {
			await runCmd("pdftoppm", [
				"-jpeg",
				"-jpegopt",
				`quality=${q}`,
				"-f",
				"1",
				"-l",
				"1",
				"-r",
				"25",
				src,
				prefix
			]);
			const base = prefix.split(sep).pop();
			const files = readdirSyncSafe(thumbsDir).filter((f) => f.startsWith(`${base}-`));
			if (files.length > 0) {
				const p = join(thumbsDir, files[0]);
				let sz = 0;
				try {
					sz = (await stat(p)).size;
				} catch {}
				if (sz > 0) {
					last = p;
					if (sz <= THUMB_MAX_BYTES) break;
					await rm(p, { force: true }).catch(() => {});
				}
			}
		}
		if (!last) return false;
		await rename(last, dst);
		const base = prefix.split(sep).pop();
		for (const f of readdirSyncSafe(thumbsDir).filter((x) => x.startsWith(`${base}-`))) await rm(join(thumbsDir, f), { force: true }).catch(() => {});
		return true;
	} catch {
		return false;
	}
}
/** 确保缩略图存在并返回其路径；不支持或失败返回 null。 */
const thumbInFlight = /* @__PURE__ */ new Map();
function ensureThumbnail(dir, name) {
	const family = thumbFamily(name);
	const gen = family ? THUMB_GENERATORS[family] : void 0;
	if (typeof gen !== "function") return Promise.resolve(null);
	const src = join(dir, name);
	const thumbsDir = join(dir, THUMBS_DIR_NAME);
	const dst = join(thumbsDir, `${name}.jpg`);
	const work = async () => {
		try {
			const info = await stat(dst);
			if (info.isFile() && info.size > 0) return dst;
		} catch {}
		await mkdir(thumbsDir, { recursive: true }).catch(() => {});
		if (!await gen(src, dst, thumbsDir, name)) {
			await rm(dst, { force: true }).catch(() => {});
			return null;
		}
		return dst;
	};
	let p = thumbInFlight.get(dst);
	if (!p) {
		p = work().catch(() => null).finally(() => thumbInFlight.delete(dst));
		thumbInFlight.set(dst, p);
	}
	return p;
}
function apply(context) {
	/** Resolve the session workspace root, or null when the session is unknown. */
	const resolveWorkspace = (sessionId) => {
		if (typeof sessionId !== "string" || !SESSION_ID_RE.test(sessionId)) return null;
		try {
			return context.agents.get(SessionId(sessionId))?.session.header.cwd ?? null;
		} catch {
			return null;
		}
	};
	/** Pending upload bookkeeping: uploadId -> {sessionId, name, size, tmpPath, hash, bytes} */
	const pending = /* @__PURE__ */ new Map();
	const handler = async (req, res) => {
		const url = new URL(req.url ?? "/", "http://localhost");
		const path = url.pathname;
		if (req.method === "POST" && path === `${API_PREFIX}/uploads/prepare`) {
			let body;
			try {
				body = JSON.parse(await readBody(req));
			} catch {
				return writeError(res, 400, "FILE_BAD_REQUEST", "Invalid JSON body.");
			}
			const { sessionId, name, size } = body ?? {};
			if (typeof sessionId !== "string" || typeof name !== "string" || typeof size !== "number") return writeError(res, 400, "FILE_BAD_REQUEST", "sessionId, name and size are required.");
			const workspace = resolveWorkspace(sessionId);
			if (!workspace) return writeError(res, 404, "FILE_SESSION_NOT_FOUND", "Session workspace not found.");
			if (size > MAX_FILE_BYTES || size < 0) return writeError(res, 413, "FILE_UPLOAD_TOO_LARGE", `File exceeds ${MAX_FILE_BYTES} bytes.`);
			const uploadId = randomUUID();
			const tmpDir = join(sessionUploadDir(workspace, sessionId), ".tmp");
			await mkdir(tmpDir, { recursive: true });
			pending.set(uploadId, {
				sessionId,
				displayName: safeBasename(name),
				size,
				tmpPath: join(tmpDir, uploadId),
				hash: createHash("sha256"),
				bytes: 0
			});
			return writeJson(res, 200, {
				uploadId,
				putUrl: `${API_PREFIX}/uploads/${uploadId}`,
				commitUrl: `${API_PREFIX}/uploads/${uploadId}/commit`,
				deleteUrl: `${API_PREFIX}/uploads/${uploadId}`
			});
		}
		const putMatch = path.match(new RegExp(`^${API_PREFIX}/uploads/([0-9a-f-]+)$`));
		if (req.method === "PUT" && putMatch) {
			const upload = pending.get(putMatch[1]);
			if (!upload) return writeError(res, 404, "FILE_UPLOAD_NOT_FOUND", "Unknown upload.");
			try {
				const sink = createWriteStream(upload.tmpPath);
				req.on("data", (chunk) => {
					upload.bytes += chunk.length;
					upload.hash.update(chunk);
					if (upload.bytes > upload.size) sink.destroy(/* @__PURE__ */ new Error("size exceeded"));
				});
				await pipeline(req, sink);
				upload.sha256 = upload.hash.digest("hex");
				return writeJson(res, 200, {
					ok: true,
					bytes: upload.bytes,
					sourceSha256: upload.sha256
				});
			} catch (err) {
				await rm(upload.tmpPath, { force: true }).catch(() => {});
				pending.delete(putMatch[1]);
				return writeError(res, 400, "FILE_UPLOAD_INCOMPLETE", err.message);
			}
		}
		const commitMatch = path.match(new RegExp(`^${API_PREFIX}/uploads/([0-9a-f-]+)/commit$`));
		if (req.method === "POST" && commitMatch) {
			const upload = pending.get(commitMatch[1]);
			if (!upload) return writeError(res, 404, "FILE_UPLOAD_NOT_FOUND", "Unknown upload.");
			let body;
			try {
				body = JSON.parse(await readBody(req));
			} catch {
				return writeError(res, 400, "FILE_BAD_REQUEST", "Invalid JSON body.");
			}
			const expected = body?.expectedSha256;
			const actual = upload.sha256;
			if (typeof expected !== "string" || expected !== actual) {
				await rm(upload.tmpPath, { force: true }).catch(() => {});
				pending.delete(commitMatch[1]);
				return writeError(res, 400, "FILE_CHECKSUM_MISMATCH", "Checksum mismatch.");
			}
			const workspace = resolveWorkspace(upload.sessionId);
			if (!workspace) {
				await rm(upload.tmpPath, { force: true }).catch(() => {});
				pending.delete(commitMatch[1]);
				return writeError(res, 404, "FILE_SESSION_NOT_FOUND", "Session workspace not found.");
			}
			const dir = sessionUploadDir(workspace, upload.sessionId);
			await mkdir(dir, { recursive: true });
			const fileName = uniqueNameIn(dir, upload.displayName);
			const finalPath = join(dir, fileName);
			await rename(upload.tmpPath, finalPath);
			pending.delete(commitMatch[1]);
			ensureThumbnail(dir, fileName).catch(() => {});
			return writeJson(res, 200, {
				name: fileName,
				displayName: fileName,
				absolutePath: finalPath,
				size: upload.bytes,
				createdAt: (/* @__PURE__ */ new Date()).toISOString()
			});
		}
		if (req.method === "DELETE" && putMatch) {
			const upload = pending.get(putMatch[1]);
			if (!upload) return writeError(res, 404, "FILE_UPLOAD_NOT_FOUND", "Unknown upload.");
			await rm(upload.tmpPath, { force: true }).catch(() => {});
			pending.delete(putMatch[1]);
			return writeJson(res, 200, { ok: true });
		}
		const listMatch = path.match(new RegExp(`^${API_PREFIX}/sessions/([^/]+)/attachments$`));
		if (req.method === "GET" && listMatch) {
			const sessionId = decodeURIComponent(listMatch[1]);
			const workspace = resolveWorkspace(sessionId);
			if (!workspace) return writeError(res, 404, "FILE_SESSION_NOT_FOUND", "Session workspace not found.");
			const dir = sessionUploadDir(workspace, sessionId);
			const attachments = [];
			for (const n of readdirSyncSafe(dir)) {
				if (n.startsWith(".")) continue;
				try {
					const info = await stat(join(dir, n));
					if (!info.isFile()) continue;
					attachments.push({
						name: n,
						displayName: n,
						absolutePath: join(dir, n),
						size: info.size,
						createdAt: info.mtime.toISOString()
					});
				} catch {}
			}
			attachments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
			return writeJson(res, 200, { attachments });
		}
		if (req.method === "GET" && path === `${API_PREFIX}/attachments/content`) {
			const sessionId = url.searchParams.get("sessionId") ?? "";
			const name = url.searchParams.get("name") ?? "";
			const workspace = resolveWorkspace(sessionId);
			if (!workspace) return writeError(res, 404, "FILE_SESSION_NOT_FOUND", "Session workspace not found.");
			if (!name) return writeError(res, 400, "FILE_BAD_REQUEST", "name is required.");
			const dir = normalize(sessionUploadDir(workspace, sessionId));
			const target = normalize(join(dir, name));
			if (target !== dir && !target.startsWith(dir + sep)) return writeError(res, 400, "FILE_BAD_REQUEST", "Path escapes the session upload directory.");
			try {
				if (!(await stat(target)).isFile()) throw new Error("not a file");
			} catch {
				return writeError(res, 404, "FILE_NOT_FOUND", "Attachment file is missing on disk.");
			}
			return sendFile(res, target, name);
		}
		const delMatch = path.match(new RegExp(`^${API_PREFIX}/sessions/([^/]+)/attachments$`));
		if (req.method === "DELETE" && delMatch) {
			const sessionId = decodeURIComponent(delMatch[1]);
			const name = url.searchParams.get("name") ?? "";
			if (!name) return writeError(res, 400, "FILE_BAD_REQUEST", "name is required.");
			const workspace = resolveWorkspace(sessionId);
			if (!workspace) return writeError(res, 404, "FILE_SESSION_NOT_FOUND", "Session workspace not found.");
			const dir = normalize(sessionUploadDir(workspace, sessionId));
			const target = normalize(join(dir, name));
			if (target !== dir && !target.startsWith(dir + sep)) return writeError(res, 400, "FILE_BAD_REQUEST", "Path escapes the session upload directory.");
			await unlink(join(dir, THUMBS_DIR_NAME, `${name}.jpg`)).catch(() => {});
			return writeJson(res, 200, {
				ok: true,
				name
			});
		}
		if (req.method === "GET" && path === `${API_PREFIX}/attachments/thumbnail`) {
			const sessionId = url.searchParams.get("sessionId") ?? "";
			const name = url.searchParams.get("name") ?? "";
			const workspace = resolveWorkspace(sessionId);
			if (!workspace) return writeError(res, 404, "FILE_SESSION_NOT_FOUND", "Session workspace not found.");
			if (!name) return writeError(res, 400, "FILE_BAD_REQUEST", "name is required.");
			const dir = normalize(sessionUploadDir(workspace, sessionId));
			const target = normalize(join(dir, name));
			if (target !== dir && !target.startsWith(dir + sep)) return writeError(res, 400, "FILE_BAD_REQUEST", "Path escapes the session upload directory.");
			try {
				if (!(await stat(target)).isFile()) throw new Error("not a file");
			} catch {
				return writeError(res, 404, "FILE_NOT_FOUND", "Attachment file is missing on disk.");
			}
			const thumb = await ensureThumbnail(dir, name);
			if (!thumb) return writeError(res, 404, "FILE_THUMB_UNSUPPORTED", "No thumbnail available for this file type.");
			res.writeHead(200, {
				"content-type": "image/jpeg",
				"cache-control": "public, max-age=31536000, immutable"
			});
			pipeline(createReadStream(thumb), res).catch(() => {
				res.destroy();
			});
			return;
		}
		return writeError(res, 404, "FILE_NOT_FOUND", "Route not found.");
	};
	context.effect(function* registerUploadFileHost() {
		yield context.webServer.register({
			kind: "prefix",
			path: API_PREFIX,
			handler
		});
	}, "dsh-upload-file.host");
	context.inject(["systemPrompt"], (scope) => scope.systemPrompt.context({
		name: "dsh-upload-file:session-files",
		order: 110,
		text: (assemblyContext) => {
			try {
				const header = (assemblyContext?.agent)?.session?.header;
				const cwd = header?.cwd;
				const sessionId = header?.id;
				if (!cwd || !sessionId || !SESSION_ID_RE.test(String(sessionId))) return "";
				const sessionDir = join(String(cwd), UPLOAD_DIR_NAME, String(sessionId));
				if (!readdirSyncSafe(sessionDir).some((n) => !n.startsWith("."))) return "";
				return `本会话的上传文件存放在 ${sessionDir}/ 目录；消息中的 "@UPLOAD: <文件名>" 指该目录下的同名文件（同会话重传同名文件时，文件名会自动带 _1/_2 数字后缀，以目录内实际文件名为准）。`;
			} catch {
				return "";
			}
		}
	}), "dsh-upload-file.system-prompt");
}
//#endregion
export { apply, inject };
