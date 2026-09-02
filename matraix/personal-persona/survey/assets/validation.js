//#region \0rolldown/runtime.js
var e = Object.create, t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.getPrototypeOf, a = Object.prototype.hasOwnProperty, o = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), e = null), t.exports), s = (e, i, o, s) => {
	if (i && typeof i == "object" || typeof i == "function") for (var c = r(i), l = 0, u = c.length, d; l < u; l++) d = c[l], !a.call(e, d) && d !== o && t(e, d, {
		get: ((e) => i[e]).bind(null, d),
		enumerable: !(s = n(i, d)) || s.enumerable
	});
	return e;
}, c = (n, r, a) => (a = n == null ? {} : e(i(n)), s(r || !n || !n.__esModule ? t(a, "default", {
	value: n,
	enumerable: !0
}) : a, n)), l = /* @__PURE__ */ o(((e) => {
	function t(e, t) {
		var n = e.length;
		e.push(t);
		a: for (; 0 < n;) {
			var r = n - 1 >>> 1, a = e[r];
			if (0 < i(a, t)) e[r] = t, e[n] = a, n = r;
			else break a;
		}
	}
	function n(e) {
		return e.length === 0 ? null : e[0];
	}
	function r(e) {
		if (e.length === 0) return null;
		var t = e[0], n = e.pop();
		if (n !== t) {
			e[0] = n;
			a: for (var r = 0, a = e.length, o = a >>> 1; r < o;) {
				var s = 2 * (r + 1) - 1, c = e[s], l = s + 1, u = e[l];
				if (0 > i(c, n)) l < a && 0 > i(u, c) ? (e[r] = u, e[l] = n, r = l) : (e[r] = c, e[s] = n, r = s);
				else if (l < a && 0 > i(u, n)) e[r] = u, e[l] = n, r = l;
				else break a;
			}
		}
		return t;
	}
	function i(e, t) {
		var n = e.sortIndex - t.sortIndex;
		return n === 0 ? e.id - t.id : n;
	}
	if (e.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
		var a = performance;
		e.unstable_now = function() {
			return a.now();
		};
	} else {
		var o = Date, s = o.now();
		e.unstable_now = function() {
			return o.now() - s;
		};
	}
	var c = [], l = [], u = 1, d = null, f = 3, p = !1, m = !1, h = !1, g = !1, _ = typeof setTimeout == "function" ? setTimeout : null, v = typeof clearTimeout == "function" ? clearTimeout : null, y = typeof setImmediate < "u" ? setImmediate : null;
	function b(e) {
		for (var i = n(l); i !== null;) {
			if (i.callback === null) r(l);
			else if (i.startTime <= e) r(l), i.sortIndex = i.expirationTime, t(c, i);
			else break;
			i = n(l);
		}
	}
	function x(e) {
		if (h = !1, b(e), !m) if (n(c) !== null) m = !0, S || (S = !0, D());
		else {
			var t = n(l);
			t !== null && re(x, t.startTime - e);
		}
	}
	var S = !1, C = -1, w = 5, T = -1;
	function ee() {
		return g ? !0 : !(e.unstable_now() - T < w);
	}
	function E() {
		if (g = !1, S) {
			var t = e.unstable_now();
			T = t;
			var i = !0;
			try {
				a: {
					m = !1, h && (h = !1, v(C), C = -1), p = !0;
					var a = f;
					try {
						b: {
							for (b(t), d = n(c); d !== null && !(d.expirationTime > t && ee());) {
								var o = d.callback;
								if (typeof o == "function") {
									d.callback = null, f = d.priorityLevel;
									var s = o(d.expirationTime <= t);
									if (t = e.unstable_now(), typeof s == "function") {
										d.callback = s, b(t), i = !0;
										break b;
									}
									d === n(c) && r(c), b(t);
								} else r(c);
								d = n(c);
							}
							if (d !== null) i = !0;
							else {
								var u = n(l);
								u !== null && re(x, u.startTime - t), i = !1;
							}
						}
						break a;
					} finally {
						d = null, f = a, p = !1;
					}
					i = void 0;
				}
			} finally {
				i ? D() : S = !1;
			}
		}
	}
	var D;
	if (typeof y == "function") D = function() {
		y(E);
	};
	else if (typeof MessageChannel < "u") {
		var te = new MessageChannel(), ne = te.port2;
		te.port1.onmessage = E, D = function() {
			ne.postMessage(null);
		};
	} else D = function() {
		_(E, 0);
	};
	function re(t, n) {
		C = _(function() {
			t(e.unstable_now());
		}, n);
	}
	e.unstable_IdlePriority = 5, e.unstable_ImmediatePriority = 1, e.unstable_LowPriority = 4, e.unstable_NormalPriority = 3, e.unstable_Profiling = null, e.unstable_UserBlockingPriority = 2, e.unstable_cancelCallback = function(e) {
		e.callback = null;
	}, e.unstable_forceFrameRate = function(e) {
		0 > e || 125 < e ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : w = 0 < e ? Math.floor(1e3 / e) : 5;
	}, e.unstable_getCurrentPriorityLevel = function() {
		return f;
	}, e.unstable_next = function(e) {
		switch (f) {
			case 1:
			case 2:
			case 3:
				var t = 3;
				break;
			default: t = f;
		}
		var n = f;
		f = t;
		try {
			return e();
		} finally {
			f = n;
		}
	}, e.unstable_requestPaint = function() {
		g = !0;
	}, e.unstable_runWithPriority = function(e, t) {
		switch (e) {
			case 1:
			case 2:
			case 3:
			case 4:
			case 5: break;
			default: e = 3;
		}
		var n = f;
		f = e;
		try {
			return t();
		} finally {
			f = n;
		}
	}, e.unstable_scheduleCallback = function(r, i, a) {
		var o = e.unstable_now();
		switch (typeof a == "object" && a ? (a = a.delay, a = typeof a == "number" && 0 < a ? o + a : o) : a = o, r) {
			case 1:
				var s = -1;
				break;
			case 2:
				s = 250;
				break;
			case 5:
				s = 1073741823;
				break;
			case 4:
				s = 1e4;
				break;
			default: s = 5e3;
		}
		return s = a + s, r = {
			id: u++,
			callback: i,
			priorityLevel: r,
			startTime: a,
			expirationTime: s,
			sortIndex: -1
		}, a > o ? (r.sortIndex = a, t(l, r), n(c) === null && r === n(l) && (h ? (v(C), C = -1) : h = !0, re(x, a - o))) : (r.sortIndex = s, t(c, r), m || p || (m = !0, S || (S = !0, D()))), r;
	}, e.unstable_shouldYield = ee, e.unstable_wrapCallback = function(e) {
		var t = f;
		return function() {
			var n = f;
			f = t;
			try {
				return e.apply(this, arguments);
			} finally {
				f = n;
			}
		};
	};
})), u = /* @__PURE__ */ o(((e, t) => {
	t.exports = l();
})), d = /* @__PURE__ */ o(((e) => {
	var t = Symbol.for("react.transitional.element"), n = Symbol.for("react.portal"), r = Symbol.for("react.fragment"), i = Symbol.for("react.strict_mode"), a = Symbol.for("react.profiler"), o = Symbol.for("react.consumer"), s = Symbol.for("react.context"), c = Symbol.for("react.forward_ref"), l = Symbol.for("react.suspense"), u = Symbol.for("react.memo"), d = Symbol.for("react.lazy"), f = Symbol.for("react.activity"), p = Symbol.iterator;
	function m(e) {
		return typeof e != "object" || !e ? null : (e = p && e[p] || e["@@iterator"], typeof e == "function" ? e : null);
	}
	var h = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	}, g = Object.assign, _ = {};
	function v(e, t, n) {
		this.props = e, this.context = t, this.refs = _, this.updater = n || h;
	}
	v.prototype.isReactComponent = {}, v.prototype.setState = function(e, t) {
		if (typeof e != "object" && typeof e != "function" && e != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, e, t, "setState");
	}, v.prototype.forceUpdate = function(e) {
		this.updater.enqueueForceUpdate(this, e, "forceUpdate");
	};
	function y() {}
	y.prototype = v.prototype;
	function b(e, t, n) {
		this.props = e, this.context = t, this.refs = _, this.updater = n || h;
	}
	var x = b.prototype = new y();
	x.constructor = b, g(x, v.prototype), x.isPureReactComponent = !0;
	var S = Array.isArray;
	function C() {}
	var w = {
		H: null,
		A: null,
		T: null,
		S: null
	}, T = Object.prototype.hasOwnProperty;
	function ee(e, n, r) {
		var i = r.ref;
		return {
			$$typeof: t,
			type: e,
			key: n,
			ref: i === void 0 ? null : i,
			props: r
		};
	}
	function E(e, t) {
		return ee(e.type, t, e.props);
	}
	function D(e) {
		return typeof e == "object" && !!e && e.$$typeof === t;
	}
	function te(e) {
		var t = {
			"=": "=0",
			":": "=2"
		};
		return "$" + e.replace(/[=:]/g, function(e) {
			return t[e];
		});
	}
	var ne = /\/+/g;
	function re(e, t) {
		return typeof e == "object" && e && e.key != null ? te("" + e.key) : t.toString(36);
	}
	function O(e) {
		switch (e.status) {
			case "fulfilled": return e.value;
			case "rejected": throw e.reason;
			default: switch (typeof e.status == "string" ? e.then(C, C) : (e.status = "pending", e.then(function(t) {
				e.status === "pending" && (e.status = "fulfilled", e.value = t);
			}, function(t) {
				e.status === "pending" && (e.status = "rejected", e.reason = t);
			})), e.status) {
				case "fulfilled": return e.value;
				case "rejected": throw e.reason;
			}
		}
		throw e;
	}
	function ie(e, r, i, a, o) {
		var s = typeof e;
		(s === "undefined" || s === "boolean") && (e = null);
		var c = !1;
		if (e === null) c = !0;
		else switch (s) {
			case "bigint":
			case "string":
			case "number":
				c = !0;
				break;
			case "object": switch (e.$$typeof) {
				case t:
				case n:
					c = !0;
					break;
				case d: return c = e._init, ie(c(e._payload), r, i, a, o);
			}
		}
		if (c) return o = o(e), c = a === "" ? "." + re(e, 0) : a, S(o) ? (i = "", c != null && (i = c.replace(ne, "$&/") + "/"), ie(o, r, i, "", function(e) {
			return e;
		})) : o != null && (D(o) && (o = E(o, i + (o.key == null || e && e.key === o.key ? "" : ("" + o.key).replace(ne, "$&/") + "/") + c)), r.push(o)), 1;
		c = 0;
		var l = a === "" ? "." : a + ":";
		if (S(e)) for (var u = 0; u < e.length; u++) a = e[u], s = l + re(a, u), c += ie(a, r, i, s, o);
		else if (u = m(e), typeof u == "function") for (e = u.call(e), u = 0; !(a = e.next()).done;) a = a.value, s = l + re(a, u++), c += ie(a, r, i, s, o);
		else if (s === "object") {
			if (typeof e.then == "function") return ie(O(e), r, i, a, o);
			throw r = String(e), Error("Objects are not valid as a React child (found: " + (r === "[object Object]" ? "object with keys {" + Object.keys(e).join(", ") + "}" : r) + "). If you meant to render a collection of children, use an array instead.");
		}
		return c;
	}
	function ae(e, t, n) {
		if (e == null) return e;
		var r = [], i = 0;
		return ie(e, r, "", "", function(e) {
			return t.call(n, e, i++);
		}), r;
	}
	function oe(e) {
		if (e._status === -1) {
			var t = e._result;
			t = t(), t.then(function(t) {
				(e._status === 0 || e._status === -1) && (e._status = 1, e._result = t);
			}, function(t) {
				(e._status === 0 || e._status === -1) && (e._status = 2, e._result = t);
			}), e._status === -1 && (e._status = 0, e._result = t);
		}
		if (e._status === 1) return e._result.default;
		throw e._result;
	}
	var k = typeof reportError == "function" ? reportError : function(e) {
		if (typeof window == "object" && typeof window.ErrorEvent == "function") {
			var t = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: typeof e == "object" && e && typeof e.message == "string" ? String(e.message) : String(e),
				error: e
			});
			if (!window.dispatchEvent(t)) return;
		} else if (typeof process == "object" && typeof process.emit == "function") {
			process.emit("uncaughtException", e);
			return;
		}
		console.error(e);
	}, A = {
		map: ae,
		forEach: function(e, t, n) {
			ae(e, function() {
				t.apply(this, arguments);
			}, n);
		},
		count: function(e) {
			var t = 0;
			return ae(e, function() {
				t++;
			}), t;
		},
		toArray: function(e) {
			return ae(e, function(e) {
				return e;
			}) || [];
		},
		only: function(e) {
			if (!D(e)) throw Error("React.Children.only expected to receive a single React element child.");
			return e;
		}
	};
	e.Activity = f, e.Children = A, e.Component = v, e.Fragment = r, e.Profiler = a, e.PureComponent = b, e.StrictMode = i, e.Suspense = l, e.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = w, e.__COMPILER_RUNTIME = {
		__proto__: null,
		c: function(e) {
			return w.H.useMemoCache(e);
		}
	}, e.cache = function(e) {
		return function() {
			return e.apply(null, arguments);
		};
	}, e.cacheSignal = function() {
		return null;
	}, e.cloneElement = function(e, t, n) {
		if (e == null) throw Error("The argument must be a React element, but you passed " + e + ".");
		var r = g({}, e.props), i = e.key;
		if (t != null) for (a in t.key !== void 0 && (i = "" + t.key), t) !T.call(t, a) || a === "key" || a === "__self" || a === "__source" || a === "ref" && t.ref === void 0 || (r[a] = t[a]);
		var a = arguments.length - 2;
		if (a === 1) r.children = n;
		else if (1 < a) {
			for (var o = Array(a), s = 0; s < a; s++) o[s] = arguments[s + 2];
			r.children = o;
		}
		return ee(e.type, i, r);
	}, e.createContext = function(e) {
		return e = {
			$$typeof: s,
			_currentValue: e,
			_currentValue2: e,
			_threadCount: 0,
			Provider: null,
			Consumer: null
		}, e.Provider = e, e.Consumer = {
			$$typeof: o,
			_context: e
		}, e;
	}, e.createElement = function(e, t, n) {
		var r, i = {}, a = null;
		if (t != null) for (r in t.key !== void 0 && (a = "" + t.key), t) T.call(t, r) && r !== "key" && r !== "__self" && r !== "__source" && (i[r] = t[r]);
		var o = arguments.length - 2;
		if (o === 1) i.children = n;
		else if (1 < o) {
			for (var s = Array(o), c = 0; c < o; c++) s[c] = arguments[c + 2];
			i.children = s;
		}
		if (e && e.defaultProps) for (r in o = e.defaultProps, o) i[r] === void 0 && (i[r] = o[r]);
		return ee(e, a, i);
	}, e.createRef = function() {
		return { current: null };
	}, e.forwardRef = function(e) {
		return {
			$$typeof: c,
			render: e
		};
	}, e.isValidElement = D, e.lazy = function(e) {
		return {
			$$typeof: d,
			_payload: {
				_status: -1,
				_result: e
			},
			_init: oe
		};
	}, e.memo = function(e, t) {
		return {
			$$typeof: u,
			type: e,
			compare: t === void 0 ? null : t
		};
	}, e.startTransition = function(e) {
		var t = w.T, n = {};
		w.T = n;
		try {
			var r = e(), i = w.S;
			i !== null && i(n, r), typeof r == "object" && r && typeof r.then == "function" && r.then(C, k);
		} catch (e) {
			k(e);
		} finally {
			t !== null && n.types !== null && (t.types = n.types), w.T = t;
		}
	}, e.unstable_useCacheRefresh = function() {
		return w.H.useCacheRefresh();
	}, e.use = function(e) {
		return w.H.use(e);
	}, e.useActionState = function(e, t, n) {
		return w.H.useActionState(e, t, n);
	}, e.useCallback = function(e, t) {
		return w.H.useCallback(e, t);
	}, e.useContext = function(e) {
		return w.H.useContext(e);
	}, e.useDebugValue = function() {}, e.useDeferredValue = function(e, t) {
		return w.H.useDeferredValue(e, t);
	}, e.useEffect = function(e, t) {
		return w.H.useEffect(e, t);
	}, e.useEffectEvent = function(e) {
		return w.H.useEffectEvent(e);
	}, e.useId = function() {
		return w.H.useId();
	}, e.useImperativeHandle = function(e, t, n) {
		return w.H.useImperativeHandle(e, t, n);
	}, e.useInsertionEffect = function(e, t) {
		return w.H.useInsertionEffect(e, t);
	}, e.useLayoutEffect = function(e, t) {
		return w.H.useLayoutEffect(e, t);
	}, e.useMemo = function(e, t) {
		return w.H.useMemo(e, t);
	}, e.useOptimistic = function(e, t) {
		return w.H.useOptimistic(e, t);
	}, e.useReducer = function(e, t, n) {
		return w.H.useReducer(e, t, n);
	}, e.useRef = function(e) {
		return w.H.useRef(e);
	}, e.useState = function(e) {
		return w.H.useState(e);
	}, e.useSyncExternalStore = function(e, t, n) {
		return w.H.useSyncExternalStore(e, t, n);
	}, e.useTransition = function() {
		return w.H.useTransition();
	}, e.version = "19.2.6";
})), f = /* @__PURE__ */ o(((e, t) => {
	t.exports = d();
})), p = /* @__PURE__ */ o(((e) => {
	var t = f();
	function n(e) {
		var t = "https://react.dev/errors/" + e;
		if (1 < arguments.length) {
			t += "?args[]=" + encodeURIComponent(arguments[1]);
			for (var n = 2; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
		}
		return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
	}
	function r() {}
	var i = {
		d: {
			f: r,
			r: function() {
				throw Error(n(522));
			},
			D: r,
			C: r,
			L: r,
			m: r,
			X: r,
			S: r,
			M: r
		},
		p: 0,
		findDOMNode: null
	}, a = Symbol.for("react.portal");
	function o(e, t, n) {
		var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
		return {
			$$typeof: a,
			key: r == null ? null : "" + r,
			children: e,
			containerInfo: t,
			implementation: n
		};
	}
	var s = t.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
	function c(e, t) {
		if (e === "font") return "";
		if (typeof t == "string") return t === "use-credentials" ? t : "";
	}
	e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = i, e.createPortal = function(e, t) {
		var r = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
		if (!t || t.nodeType !== 1 && t.nodeType !== 9 && t.nodeType !== 11) throw Error(n(299));
		return o(e, t, null, r);
	}, e.flushSync = function(e) {
		var t = s.T, n = i.p;
		try {
			if (s.T = null, i.p = 2, e) return e();
		} finally {
			s.T = t, i.p = n, i.d.f();
		}
	}, e.preconnect = function(e, t) {
		typeof e == "string" && (t ? (t = t.crossOrigin, t = typeof t == "string" ? t === "use-credentials" ? t : "" : void 0) : t = null, i.d.C(e, t));
	}, e.prefetchDNS = function(e) {
		typeof e == "string" && i.d.D(e);
	}, e.preinit = function(e, t) {
		if (typeof e == "string" && t && typeof t.as == "string") {
			var n = t.as, r = c(n, t.crossOrigin), a = typeof t.integrity == "string" ? t.integrity : void 0, o = typeof t.fetchPriority == "string" ? t.fetchPriority : void 0;
			n === "style" ? i.d.S(e, typeof t.precedence == "string" ? t.precedence : void 0, {
				crossOrigin: r,
				integrity: a,
				fetchPriority: o
			}) : n === "script" && i.d.X(e, {
				crossOrigin: r,
				integrity: a,
				fetchPriority: o,
				nonce: typeof t.nonce == "string" ? t.nonce : void 0
			});
		}
	}, e.preinitModule = function(e, t) {
		if (typeof e == "string") if (typeof t == "object" && t) {
			if (t.as == null || t.as === "script") {
				var n = c(t.as, t.crossOrigin);
				i.d.M(e, {
					crossOrigin: n,
					integrity: typeof t.integrity == "string" ? t.integrity : void 0,
					nonce: typeof t.nonce == "string" ? t.nonce : void 0
				});
			}
		} else t ?? i.d.M(e);
	}, e.preload = function(e, t) {
		if (typeof e == "string" && typeof t == "object" && t && typeof t.as == "string") {
			var n = t.as, r = c(n, t.crossOrigin);
			i.d.L(e, n, {
				crossOrigin: r,
				integrity: typeof t.integrity == "string" ? t.integrity : void 0,
				nonce: typeof t.nonce == "string" ? t.nonce : void 0,
				type: typeof t.type == "string" ? t.type : void 0,
				fetchPriority: typeof t.fetchPriority == "string" ? t.fetchPriority : void 0,
				referrerPolicy: typeof t.referrerPolicy == "string" ? t.referrerPolicy : void 0,
				imageSrcSet: typeof t.imageSrcSet == "string" ? t.imageSrcSet : void 0,
				imageSizes: typeof t.imageSizes == "string" ? t.imageSizes : void 0,
				media: typeof t.media == "string" ? t.media : void 0
			});
		}
	}, e.preloadModule = function(e, t) {
		if (typeof e == "string") if (t) {
			var n = c(t.as, t.crossOrigin);
			i.d.m(e, {
				as: typeof t.as == "string" && t.as !== "script" ? t.as : void 0,
				crossOrigin: n,
				integrity: typeof t.integrity == "string" ? t.integrity : void 0
			});
		} else i.d.m(e);
	}, e.requestFormReset = function(e) {
		i.d.r(e);
	}, e.unstable_batchedUpdates = function(e, t) {
		return e(t);
	}, e.useFormState = function(e, t, n) {
		return s.H.useFormState(e, t, n);
	}, e.useFormStatus = function() {
		return s.H.useHostTransitionStatus();
	}, e.version = "19.2.6";
})), m = /* @__PURE__ */ o(((e, t) => {
	function n() {
		if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) try {
			__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
		} catch (e) {
			console.error(e);
		}
	}
	n(), t.exports = p();
})), h = /* @__PURE__ */ o(((e) => {
	var t = u(), n = f(), r = m();
	function i(e) {
		var t = "https://react.dev/errors/" + e;
		if (1 < arguments.length) {
			t += "?args[]=" + encodeURIComponent(arguments[1]);
			for (var n = 2; n < arguments.length; n++) t += "&args[]=" + encodeURIComponent(arguments[n]);
		}
		return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
	}
	function a(e) {
		return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
	}
	function o(e) {
		var t = e, n = e;
		if (e.alternate) for (; t.return;) t = t.return;
		else {
			e = t;
			do
				t = e, t.flags & 4098 && (n = t.return), e = t.return;
			while (e);
		}
		return t.tag === 3 ? n : null;
	}
	function s(e) {
		if (e.tag === 13) {
			var t = e.memoizedState;
			if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
		}
		return null;
	}
	function c(e) {
		if (e.tag === 31) {
			var t = e.memoizedState;
			if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
		}
		return null;
	}
	function l(e) {
		if (o(e) !== e) throw Error(i(188));
	}
	function d(e) {
		var t = e.alternate;
		if (!t) {
			if (t = o(e), t === null) throw Error(i(188));
			return t === e ? e : null;
		}
		for (var n = e, r = t;;) {
			var a = n.return;
			if (a === null) break;
			var s = a.alternate;
			if (s === null) {
				if (r = a.return, r !== null) {
					n = r;
					continue;
				}
				break;
			}
			if (a.child === s.child) {
				for (s = a.child; s;) {
					if (s === n) return l(a), e;
					if (s === r) return l(a), t;
					s = s.sibling;
				}
				throw Error(i(188));
			}
			if (n.return !== r.return) n = a, r = s;
			else {
				for (var c = !1, u = a.child; u;) {
					if (u === n) {
						c = !0, n = a, r = s;
						break;
					}
					if (u === r) {
						c = !0, r = a, n = s;
						break;
					}
					u = u.sibling;
				}
				if (!c) {
					for (u = s.child; u;) {
						if (u === n) {
							c = !0, n = s, r = a;
							break;
						}
						if (u === r) {
							c = !0, r = s, n = a;
							break;
						}
						u = u.sibling;
					}
					if (!c) throw Error(i(189));
				}
			}
			if (n.alternate !== r) throw Error(i(190));
		}
		if (n.tag !== 3) throw Error(i(188));
		return n.stateNode.current === n ? e : t;
	}
	function p(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e;
		for (e = e.child; e !== null;) {
			if (t = p(e), t !== null) return t;
			e = e.sibling;
		}
		return null;
	}
	var h = Object.assign, g = Symbol.for("react.element"), _ = Symbol.for("react.transitional.element"), v = Symbol.for("react.portal"), y = Symbol.for("react.fragment"), b = Symbol.for("react.strict_mode"), x = Symbol.for("react.profiler"), S = Symbol.for("react.consumer"), C = Symbol.for("react.context"), w = Symbol.for("react.forward_ref"), T = Symbol.for("react.suspense"), ee = Symbol.for("react.suspense_list"), E = Symbol.for("react.memo"), D = Symbol.for("react.lazy"), te = Symbol.for("react.activity"), ne = Symbol.for("react.memo_cache_sentinel"), re = Symbol.iterator;
	function O(e) {
		return typeof e != "object" || !e ? null : (e = re && e[re] || e["@@iterator"], typeof e == "function" ? e : null);
	}
	var ie = Symbol.for("react.client.reference");
	function ae(e) {
		if (e == null) return null;
		if (typeof e == "function") return e.$$typeof === ie ? null : e.displayName || e.name || null;
		if (typeof e == "string") return e;
		switch (e) {
			case y: return "Fragment";
			case x: return "Profiler";
			case b: return "StrictMode";
			case T: return "Suspense";
			case ee: return "SuspenseList";
			case te: return "Activity";
		}
		if (typeof e == "object") switch (e.$$typeof) {
			case v: return "Portal";
			case C: return e.displayName || "Context";
			case S: return (e._context.displayName || "Context") + ".Consumer";
			case w:
				var t = e.render;
				return e = e.displayName, e ||= (e = t.displayName || t.name || "", e === "" ? "ForwardRef" : "ForwardRef(" + e + ")"), e;
			case E: return t = e.displayName || null, t === null ? ae(e.type) || "Memo" : t;
			case D:
				t = e._payload, e = e._init;
				try {
					return ae(e(t));
				} catch {}
		}
		return null;
	}
	var oe = Array.isArray, k = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, A = r.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, se = {
		pending: !1,
		data: null,
		method: null,
		action: null
	}, ce = [], le = -1;
	function j(e) {
		return { current: e };
	}
	function M(e) {
		0 > le || (e.current = ce[le], ce[le] = null, le--);
	}
	function N(e, t) {
		le++, ce[le] = e.current, e.current = t;
	}
	var ue = j(null), P = j(null), de = j(null), fe = j(null);
	function pe(e, t) {
		switch (N(de, t), N(P, e), N(ue, null), t.nodeType) {
			case 9:
			case 11:
				e = (e = t.documentElement) && (e = e.namespaceURI) ? Vd(e) : 0;
				break;
			default: if (e = t.tagName, t = t.namespaceURI) t = Vd(t), e = Hd(t, e);
			else switch (e) {
				case "svg":
					e = 1;
					break;
				case "math":
					e = 2;
					break;
				default: e = 0;
			}
		}
		M(ue), N(ue, e);
	}
	function me() {
		M(ue), M(P), M(de);
	}
	function he(e) {
		e.memoizedState !== null && N(fe, e);
		var t = ue.current, n = Hd(t, e.type);
		t !== n && (N(P, e), N(ue, n));
	}
	function ge(e) {
		P.current === e && (M(ue), M(P)), fe.current === e && (M(fe), Qf._currentValue = se);
	}
	var _e, ve;
	function ye(e) {
		if (_e === void 0) try {
			throw Error();
		} catch (e) {
			var t = e.stack.trim().match(/\n( *(at )?)/);
			_e = t && t[1] || "", ve = -1 < e.stack.indexOf("\n    at") ? " (<anonymous>)" : -1 < e.stack.indexOf("@") ? "@unknown:0:0" : "";
		}
		return "\n" + _e + e + ve;
	}
	var be = !1;
	function xe(e, t) {
		if (!e || be) return "";
		be = !0;
		var n = Error.prepareStackTrace;
		Error.prepareStackTrace = void 0;
		try {
			var r = { DetermineComponentFrameRoot: function() {
				try {
					if (t) {
						var n = function() {
							throw Error();
						};
						if (Object.defineProperty(n.prototype, "props", { set: function() {
							throw Error();
						} }), typeof Reflect == "object" && Reflect.construct) {
							try {
								Reflect.construct(n, []);
							} catch (e) {
								var r = e;
							}
							Reflect.construct(e, [], n);
						} else {
							try {
								n.call();
							} catch (e) {
								r = e;
							}
							e.call(n.prototype);
						}
					} else {
						try {
							throw Error();
						} catch (e) {
							r = e;
						}
						(n = e()) && typeof n.catch == "function" && n.catch(function() {});
					}
				} catch (e) {
					if (e && r && typeof e.stack == "string") return [e.stack, r.stack];
				}
				return [null, null];
			} };
			r.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
			var i = Object.getOwnPropertyDescriptor(r.DetermineComponentFrameRoot, "name");
			i && i.configurable && Object.defineProperty(r.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
			var a = r.DetermineComponentFrameRoot(), o = a[0], s = a[1];
			if (o && s) {
				var c = o.split("\n"), l = s.split("\n");
				for (i = r = 0; r < c.length && !c[r].includes("DetermineComponentFrameRoot");) r++;
				for (; i < l.length && !l[i].includes("DetermineComponentFrameRoot");) i++;
				if (r === c.length || i === l.length) for (r = c.length - 1, i = l.length - 1; 1 <= r && 0 <= i && c[r] !== l[i];) i--;
				for (; 1 <= r && 0 <= i; r--, i--) if (c[r] !== l[i]) {
					if (r !== 1 || i !== 1) do
						if (r--, i--, 0 > i || c[r] !== l[i]) {
							var u = "\n" + c[r].replace(" at new ", " at ");
							return e.displayName && u.includes("<anonymous>") && (u = u.replace("<anonymous>", e.displayName)), u;
						}
					while (1 <= r && 0 <= i);
					break;
				}
			}
		} finally {
			be = !1, Error.prepareStackTrace = n;
		}
		return (n = e ? e.displayName || e.name : "") ? ye(n) : "";
	}
	function Se(e, t) {
		switch (e.tag) {
			case 26:
			case 27:
			case 5: return ye(e.type);
			case 16: return ye("Lazy");
			case 13: return e.child !== t && t !== null ? ye("Suspense Fallback") : ye("Suspense");
			case 19: return ye("SuspenseList");
			case 0:
			case 15: return xe(e.type, !1);
			case 11: return xe(e.type.render, !1);
			case 1: return xe(e.type, !0);
			case 31: return ye("Activity");
			default: return "";
		}
	}
	function Ce(e) {
		try {
			var t = "", n = null;
			do
				t += Se(e, n), n = e, e = e.return;
			while (e);
			return t;
		} catch (e) {
			return "\nError generating stack: " + e.message + "\n" + e.stack;
		}
	}
	var we = Object.prototype.hasOwnProperty, Te = t.unstable_scheduleCallback, Ee = t.unstable_cancelCallback, De = t.unstable_shouldYield, Oe = t.unstable_requestPaint, ke = t.unstable_now, Ae = t.unstable_getCurrentPriorityLevel, je = t.unstable_ImmediatePriority, Me = t.unstable_UserBlockingPriority, Ne = t.unstable_NormalPriority, Pe = t.unstable_LowPriority, Fe = t.unstable_IdlePriority, Ie = t.log, Le = t.unstable_setDisableYieldValue, Re = null, ze = null;
	function Be(e) {
		if (typeof Ie == "function" && Le(e), ze && typeof ze.setStrictMode == "function") try {
			ze.setStrictMode(Re, e);
		} catch {}
	}
	var Ve = Math.clz32 ? Math.clz32 : We, He = Math.log, Ue = Math.LN2;
	function We(e) {
		return e >>>= 0, e === 0 ? 32 : 31 - (He(e) / Ue | 0) | 0;
	}
	var Ge = 256, Ke = 262144, qe = 4194304;
	function Je(e) {
		var t = e & 42;
		if (t !== 0) return t;
		switch (e & -e) {
			case 1: return 1;
			case 2: return 2;
			case 4: return 4;
			case 8: return 8;
			case 16: return 16;
			case 32: return 32;
			case 64: return 64;
			case 128: return 128;
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072: return e & 261888;
			case 262144:
			case 524288:
			case 1048576:
			case 2097152: return e & 3932160;
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432: return e & 62914560;
			case 67108864: return 67108864;
			case 134217728: return 134217728;
			case 268435456: return 268435456;
			case 536870912: return 536870912;
			case 1073741824: return 0;
			default: return e;
		}
	}
	function Ye(e, t, n) {
		var r = e.pendingLanes;
		if (r === 0) return 0;
		var i = 0, a = e.suspendedLanes, o = e.pingedLanes;
		e = e.warmLanes;
		var s = r & 134217727;
		return s === 0 ? (s = r & ~a, s === 0 ? o === 0 ? n || (n = r & ~e, n !== 0 && (i = Je(n))) : i = Je(o) : i = Je(s)) : (r = s & ~a, r === 0 ? (o &= s, o === 0 ? n || (n = s & ~e, n !== 0 && (i = Je(n))) : i = Je(o)) : i = Je(r)), i === 0 ? 0 : t !== 0 && t !== i && (t & a) === 0 && (a = i & -i, n = t & -t, a >= n || a === 32 && n & 4194048) ? t : i;
	}
	function Xe(e, t) {
		return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
	}
	function Ze(e, t) {
		switch (e) {
			case 1:
			case 2:
			case 4:
			case 8:
			case 64: return t + 250;
			case 16:
			case 32:
			case 128:
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
			case 262144:
			case 524288:
			case 1048576:
			case 2097152: return t + 5e3;
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432: return -1;
			case 67108864:
			case 134217728:
			case 268435456:
			case 536870912:
			case 1073741824: return -1;
			default: return -1;
		}
	}
	function Qe() {
		var e = qe;
		return qe <<= 1, !(qe & 62914560) && (qe = 4194304), e;
	}
	function $e(e) {
		for (var t = [], n = 0; 31 > n; n++) t.push(e);
		return t;
	}
	function F(e, t) {
		e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
	}
	function et(e, t, n, r, i, a) {
		var o = e.pendingLanes;
		e.pendingLanes = n, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= n, e.entangledLanes &= n, e.errorRecoveryDisabledLanes &= n, e.shellSuspendCounter = 0;
		var s = e.entanglements, c = e.expirationTimes, l = e.hiddenUpdates;
		for (n = o & ~n; 0 < n;) {
			var u = 31 - Ve(n), d = 1 << u;
			s[u] = 0, c[u] = -1;
			var f = l[u];
			if (f !== null) for (l[u] = null, u = 0; u < f.length; u++) {
				var p = f[u];
				p !== null && (p.lane &= -536870913);
			}
			n &= ~d;
		}
		r !== 0 && tt(e, r, 0), a !== 0 && i === 0 && e.tag !== 0 && (e.suspendedLanes |= a & ~(o & ~t));
	}
	function tt(e, t, n) {
		e.pendingLanes |= t, e.suspendedLanes &= ~t;
		var r = 31 - Ve(t);
		e.entangledLanes |= t, e.entanglements[r] = e.entanglements[r] | 1073741824 | n & 261930;
	}
	function nt(e, t) {
		var n = e.entangledLanes |= t;
		for (e = e.entanglements; n;) {
			var r = 31 - Ve(n), i = 1 << r;
			i & t | e[r] & t && (e[r] |= t), n &= ~i;
		}
	}
	function rt(e, t) {
		var n = t & -t;
		return n = n & 42 ? 1 : it(n), (n & (e.suspendedLanes | t)) === 0 ? n : 0;
	}
	function it(e) {
		switch (e) {
			case 2:
				e = 1;
				break;
			case 8:
				e = 4;
				break;
			case 32:
				e = 16;
				break;
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
			case 262144:
			case 524288:
			case 1048576:
			case 2097152:
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432:
				e = 128;
				break;
			case 268435456:
				e = 134217728;
				break;
			default: e = 0;
		}
		return e;
	}
	function at(e) {
		return e &= -e, 2 < e ? 8 < e ? e & 134217727 ? 32 : 268435456 : 8 : 2;
	}
	function ot() {
		var e = A.p;
		return e === 0 ? (e = window.event, e === void 0 ? 32 : mp(e.type)) : e;
	}
	function st(e, t) {
		var n = A.p;
		try {
			return A.p = e, t();
		} finally {
			A.p = n;
		}
	}
	var ct = Math.random().toString(36).slice(2), lt = "__reactFiber$" + ct, ut = "__reactProps$" + ct, I = "__reactContainer$" + ct, dt = "__reactEvents$" + ct, ft = "__reactListeners$" + ct, pt = "__reactHandles$" + ct, mt = "__reactResources$" + ct, ht = "__reactMarker$" + ct;
	function gt(e) {
		delete e[lt], delete e[ut], delete e[dt], delete e[ft], delete e[pt];
	}
	function _t(e) {
		var t = e[lt];
		if (t) return t;
		for (var n = e.parentNode; n;) {
			if (t = n[I] || n[lt]) {
				if (n = t.alternate, t.child !== null || n !== null && n.child !== null) for (e = df(e); e !== null;) {
					if (n = e[lt]) return n;
					e = df(e);
				}
				return t;
			}
			e = n, n = e.parentNode;
		}
		return null;
	}
	function L(e) {
		if (e = e[lt] || e[I]) {
			var t = e.tag;
			if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return e;
		}
		return null;
	}
	function vt(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
		throw Error(i(33));
	}
	function yt(e) {
		var t = e[mt];
		return t ||= e[mt] = {
			hoistableStyles: /* @__PURE__ */ new Map(),
			hoistableScripts: /* @__PURE__ */ new Map()
		}, t;
	}
	function bt(e) {
		e[ht] = !0;
	}
	var xt = /* @__PURE__ */ new Set(), St = {};
	function Ct(e, t) {
		wt(e, t), wt(e + "Capture", t);
	}
	function wt(e, t) {
		for (St[e] = t, e = 0; e < t.length; e++) xt.add(t[e]);
	}
	var Tt = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), Et = {}, Dt = {};
	function Ot(e) {
		return we.call(Dt, e) ? !0 : we.call(Et, e) ? !1 : Tt.test(e) ? Dt[e] = !0 : (Et[e] = !0, !1);
	}
	function kt(e, t, n) {
		if (Ot(t)) if (n === null) e.removeAttribute(t);
		else {
			switch (typeof n) {
				case "undefined":
				case "function":
				case "symbol":
					e.removeAttribute(t);
					return;
				case "boolean":
					var r = t.toLowerCase().slice(0, 5);
					if (r !== "data-" && r !== "aria-") {
						e.removeAttribute(t);
						return;
					}
			}
			e.setAttribute(t, "" + n);
		}
	}
	function At(e, t, n) {
		if (n === null) e.removeAttribute(t);
		else {
			switch (typeof n) {
				case "undefined":
				case "function":
				case "symbol":
				case "boolean":
					e.removeAttribute(t);
					return;
			}
			e.setAttribute(t, "" + n);
		}
	}
	function jt(e, t, n, r) {
		if (r === null) e.removeAttribute(n);
		else {
			switch (typeof r) {
				case "undefined":
				case "function":
				case "symbol":
				case "boolean":
					e.removeAttribute(n);
					return;
			}
			e.setAttributeNS(t, n, "" + r);
		}
	}
	function Mt(e) {
		switch (typeof e) {
			case "bigint":
			case "boolean":
			case "number":
			case "string":
			case "undefined": return e;
			case "object": return e;
			default: return "";
		}
	}
	function Nt(e) {
		var t = e.type;
		return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
	}
	function Pt(e, t, n) {
		var r = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
		if (!e.hasOwnProperty(t) && r !== void 0 && typeof r.get == "function" && typeof r.set == "function") {
			var i = r.get, a = r.set;
			return Object.defineProperty(e, t, {
				configurable: !0,
				get: function() {
					return i.call(this);
				},
				set: function(e) {
					n = "" + e, a.call(this, e);
				}
			}), Object.defineProperty(e, t, { enumerable: r.enumerable }), {
				getValue: function() {
					return n;
				},
				setValue: function(e) {
					n = "" + e;
				},
				stopTracking: function() {
					e._valueTracker = null, delete e[t];
				}
			};
		}
	}
	function Ft(e) {
		if (!e._valueTracker) {
			var t = Nt(e) ? "checked" : "value";
			e._valueTracker = Pt(e, t, "" + e[t]);
		}
	}
	function It(e) {
		if (!e) return !1;
		var t = e._valueTracker;
		if (!t) return !0;
		var n = t.getValue(), r = "";
		return e && (r = Nt(e) ? e.checked ? "true" : "false" : e.value), e = r, e === n ? !1 : (t.setValue(e), !0);
	}
	function Lt(e) {
		if (e ||= typeof document < "u" ? document : void 0, e === void 0) return null;
		try {
			return e.activeElement || e.body;
		} catch {
			return e.body;
		}
	}
	var R = /[\n"\\]/g;
	function Rt(e) {
		return e.replace(R, function(e) {
			return "\\" + e.charCodeAt(0).toString(16) + " ";
		});
	}
	function zt(e, t, n, r, i, a, o, s) {
		e.name = "", o != null && typeof o != "function" && typeof o != "symbol" && typeof o != "boolean" ? e.type = o : e.removeAttribute("type"), t == null ? o !== "submit" && o !== "reset" || e.removeAttribute("value") : o === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + Mt(t)) : e.value !== "" + Mt(t) && (e.value = "" + Mt(t)), t == null ? n == null ? r != null && e.removeAttribute("value") : Vt(e, o, Mt(n)) : Vt(e, o, Mt(t)), i == null && a != null && (e.defaultChecked = !!a), i != null && (e.checked = i && typeof i != "function" && typeof i != "symbol"), s != null && typeof s != "function" && typeof s != "symbol" && typeof s != "boolean" ? e.name = "" + Mt(s) : e.removeAttribute("name");
	}
	function Bt(e, t, n, r, i, a, o, s) {
		if (a != null && typeof a != "function" && typeof a != "symbol" && typeof a != "boolean" && (e.type = a), t != null || n != null) {
			if (!(a !== "submit" && a !== "reset" || t != null)) {
				Ft(e);
				return;
			}
			n = n == null ? "" : "" + Mt(n), t = t == null ? n : "" + Mt(t), s || t === e.value || (e.value = t), e.defaultValue = t;
		}
		r ??= i, r = typeof r != "function" && typeof r != "symbol" && !!r, e.checked = s ? e.checked : !!r, e.defaultChecked = !!r, o != null && typeof o != "function" && typeof o != "symbol" && typeof o != "boolean" && (e.name = o), Ft(e);
	}
	function Vt(e, t, n) {
		t === "number" && Lt(e.ownerDocument) === e || e.defaultValue === "" + n || (e.defaultValue = "" + n);
	}
	function Ht(e, t, n, r) {
		if (e = e.options, t) {
			t = {};
			for (var i = 0; i < n.length; i++) t["$" + n[i]] = !0;
			for (n = 0; n < e.length; n++) i = t.hasOwnProperty("$" + e[n].value), e[n].selected !== i && (e[n].selected = i), i && r && (e[n].defaultSelected = !0);
		} else {
			for (n = "" + Mt(n), t = null, i = 0; i < e.length; i++) {
				if (e[i].value === n) {
					e[i].selected = !0, r && (e[i].defaultSelected = !0);
					return;
				}
				t !== null || e[i].disabled || (t = e[i]);
			}
			t !== null && (t.selected = !0);
		}
	}
	function Ut(e, t, n) {
		if (t != null && (t = "" + Mt(t), t !== e.value && (e.value = t), n == null)) {
			e.defaultValue !== t && (e.defaultValue = t);
			return;
		}
		e.defaultValue = n == null ? "" : "" + Mt(n);
	}
	function Wt(e, t, n, r) {
		if (t == null) {
			if (r != null) {
				if (n != null) throw Error(i(92));
				if (oe(r)) {
					if (1 < r.length) throw Error(i(93));
					r = r[0];
				}
				n = r;
			}
			n ??= "", t = n;
		}
		n = Mt(t), e.defaultValue = n, r = e.textContent, r === n && r !== "" && r !== null && (e.value = r), Ft(e);
	}
	function Gt(e, t) {
		if (t) {
			var n = e.firstChild;
			if (n && n === e.lastChild && n.nodeType === 3) {
				n.nodeValue = t;
				return;
			}
		}
		e.textContent = t;
	}
	var Kt = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
	function qt(e, t, n) {
		var r = t.indexOf("--") === 0;
		n == null || typeof n == "boolean" || n === "" ? r ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : r ? e.setProperty(t, n) : typeof n != "number" || n === 0 || Kt.has(t) ? t === "float" ? e.cssFloat = n : e[t] = ("" + n).trim() : e[t] = n + "px";
	}
	function Jt(e, t, n) {
		if (t != null && typeof t != "object") throw Error(i(62));
		if (e = e.style, n != null) {
			for (var r in n) !n.hasOwnProperty(r) || t != null && t.hasOwnProperty(r) || (r.indexOf("--") === 0 ? e.setProperty(r, "") : r === "float" ? e.cssFloat = "" : e[r] = "");
			for (var a in t) r = t[a], t.hasOwnProperty(a) && n[a] !== r && qt(e, a, r);
		} else for (var o in t) t.hasOwnProperty(o) && qt(e, o, t[o]);
	}
	function Yt(e) {
		if (e.indexOf("-") === -1) return !1;
		switch (e) {
			case "annotation-xml":
			case "color-profile":
			case "font-face":
			case "font-face-src":
			case "font-face-uri":
			case "font-face-format":
			case "font-face-name":
			case "missing-glyph": return !1;
			default: return !0;
		}
	}
	var Xt = new Map([
		["acceptCharset", "accept-charset"],
		["htmlFor", "for"],
		["httpEquiv", "http-equiv"],
		["crossOrigin", "crossorigin"],
		["accentHeight", "accent-height"],
		["alignmentBaseline", "alignment-baseline"],
		["arabicForm", "arabic-form"],
		["baselineShift", "baseline-shift"],
		["capHeight", "cap-height"],
		["clipPath", "clip-path"],
		["clipRule", "clip-rule"],
		["colorInterpolation", "color-interpolation"],
		["colorInterpolationFilters", "color-interpolation-filters"],
		["colorProfile", "color-profile"],
		["colorRendering", "color-rendering"],
		["dominantBaseline", "dominant-baseline"],
		["enableBackground", "enable-background"],
		["fillOpacity", "fill-opacity"],
		["fillRule", "fill-rule"],
		["floodColor", "flood-color"],
		["floodOpacity", "flood-opacity"],
		["fontFamily", "font-family"],
		["fontSize", "font-size"],
		["fontSizeAdjust", "font-size-adjust"],
		["fontStretch", "font-stretch"],
		["fontStyle", "font-style"],
		["fontVariant", "font-variant"],
		["fontWeight", "font-weight"],
		["glyphName", "glyph-name"],
		["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
		["glyphOrientationVertical", "glyph-orientation-vertical"],
		["horizAdvX", "horiz-adv-x"],
		["horizOriginX", "horiz-origin-x"],
		["imageRendering", "image-rendering"],
		["letterSpacing", "letter-spacing"],
		["lightingColor", "lighting-color"],
		["markerEnd", "marker-end"],
		["markerMid", "marker-mid"],
		["markerStart", "marker-start"],
		["overlinePosition", "overline-position"],
		["overlineThickness", "overline-thickness"],
		["paintOrder", "paint-order"],
		["panose-1", "panose-1"],
		["pointerEvents", "pointer-events"],
		["renderingIntent", "rendering-intent"],
		["shapeRendering", "shape-rendering"],
		["stopColor", "stop-color"],
		["stopOpacity", "stop-opacity"],
		["strikethroughPosition", "strikethrough-position"],
		["strikethroughThickness", "strikethrough-thickness"],
		["strokeDasharray", "stroke-dasharray"],
		["strokeDashoffset", "stroke-dashoffset"],
		["strokeLinecap", "stroke-linecap"],
		["strokeLinejoin", "stroke-linejoin"],
		["strokeMiterlimit", "stroke-miterlimit"],
		["strokeOpacity", "stroke-opacity"],
		["strokeWidth", "stroke-width"],
		["textAnchor", "text-anchor"],
		["textDecoration", "text-decoration"],
		["textRendering", "text-rendering"],
		["transformOrigin", "transform-origin"],
		["underlinePosition", "underline-position"],
		["underlineThickness", "underline-thickness"],
		["unicodeBidi", "unicode-bidi"],
		["unicodeRange", "unicode-range"],
		["unitsPerEm", "units-per-em"],
		["vAlphabetic", "v-alphabetic"],
		["vHanging", "v-hanging"],
		["vIdeographic", "v-ideographic"],
		["vMathematical", "v-mathematical"],
		["vectorEffect", "vector-effect"],
		["vertAdvY", "vert-adv-y"],
		["vertOriginX", "vert-origin-x"],
		["vertOriginY", "vert-origin-y"],
		["wordSpacing", "word-spacing"],
		["writingMode", "writing-mode"],
		["xmlnsXlink", "xmlns:xlink"],
		["xHeight", "x-height"]
	]), Zt = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
	function Qt(e) {
		return Zt.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
	}
	function $t() {}
	var en = null;
	function tn(e) {
		return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
	}
	var nn = null, rn = null;
	function an(e) {
		var t = L(e);
		if (t && (e = t.stateNode)) {
			var n = e[ut] || null;
			a: switch (e = t.stateNode, t.type) {
				case "input":
					if (zt(e, n.value, n.defaultValue, n.defaultValue, n.checked, n.defaultChecked, n.type, n.name), t = n.name, n.type === "radio" && t != null) {
						for (n = e; n.parentNode;) n = n.parentNode;
						for (n = n.querySelectorAll("input[name=\"" + Rt("" + t) + "\"][type=\"radio\"]"), t = 0; t < n.length; t++) {
							var r = n[t];
							if (r !== e && r.form === e.form) {
								var a = r[ut] || null;
								if (!a) throw Error(i(90));
								zt(r, a.value, a.defaultValue, a.defaultValue, a.checked, a.defaultChecked, a.type, a.name);
							}
						}
						for (t = 0; t < n.length; t++) r = n[t], r.form === e.form && It(r);
					}
					break a;
				case "textarea":
					Ut(e, n.value, n.defaultValue);
					break a;
				case "select": t = n.value, t != null && Ht(e, !!n.multiple, t, !1);
			}
		}
	}
	var on = !1;
	function sn(e, t, n) {
		if (on) return e(t, n);
		on = !0;
		try {
			return e(t);
		} finally {
			if (on = !1, (nn !== null || rn !== null) && (bu(), nn && (t = nn, e = rn, rn = nn = null, an(t), e))) for (t = 0; t < e.length; t++) an(e[t]);
		}
	}
	function cn(e, t) {
		var n = e.stateNode;
		if (n === null) return null;
		var r = n[ut] || null;
		if (r === null) return null;
		n = r[t];
		a: switch (t) {
			case "onClick":
			case "onClickCapture":
			case "onDoubleClick":
			case "onDoubleClickCapture":
			case "onMouseDown":
			case "onMouseDownCapture":
			case "onMouseMove":
			case "onMouseMoveCapture":
			case "onMouseUp":
			case "onMouseUpCapture":
			case "onMouseEnter":
				(r = !r.disabled) || (e = e.type, r = !(e === "button" || e === "input" || e === "select" || e === "textarea")), e = !r;
				break a;
			default: e = !1;
		}
		if (e) return null;
		if (n && typeof n != "function") throw Error(i(231, t, typeof n));
		return n;
	}
	var ln = !(typeof window > "u" || window.document === void 0 || window.document.createElement === void 0), un = !1;
	if (ln) try {
		var dn = {};
		Object.defineProperty(dn, "passive", { get: function() {
			un = !0;
		} }), window.addEventListener("test", dn, dn), window.removeEventListener("test", dn, dn);
	} catch {
		un = !1;
	}
	var fn = null, pn = null, mn = null;
	function hn() {
		if (mn) return mn;
		var e, t = pn, n = t.length, r, i = "value" in fn ? fn.value : fn.textContent, a = i.length;
		for (e = 0; e < n && t[e] === i[e]; e++);
		var o = n - e;
		for (r = 1; r <= o && t[n - r] === i[a - r]; r++);
		return mn = i.slice(e, 1 < r ? 1 - r : void 0);
	}
	function gn(e) {
		var t = e.keyCode;
		return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
	}
	function _n() {
		return !0;
	}
	function vn() {
		return !1;
	}
	function yn(e) {
		function t(t, n, r, i, a) {
			for (var o in this._reactName = t, this._targetInst = r, this.type = n, this.nativeEvent = i, this.target = a, this.currentTarget = null, e) e.hasOwnProperty(o) && (t = e[o], this[o] = t ? t(i) : i[o]);
			return this.isDefaultPrevented = (i.defaultPrevented == null ? !1 === i.returnValue : i.defaultPrevented) ? _n : vn, this.isPropagationStopped = vn, this;
		}
		return h(t.prototype, {
			preventDefault: function() {
				this.defaultPrevented = !0;
				var e = this.nativeEvent;
				e && (e.preventDefault ? e.preventDefault() : typeof e.returnValue != "unknown" && (e.returnValue = !1), this.isDefaultPrevented = _n);
			},
			stopPropagation: function() {
				var e = this.nativeEvent;
				e && (e.stopPropagation ? e.stopPropagation() : typeof e.cancelBubble != "unknown" && (e.cancelBubble = !0), this.isPropagationStopped = _n);
			},
			persist: function() {},
			isPersistent: _n
		}), t;
	}
	var bn = {
		eventPhase: 0,
		bubbles: 0,
		cancelable: 0,
		timeStamp: function(e) {
			return e.timeStamp || Date.now();
		},
		defaultPrevented: 0,
		isTrusted: 0
	}, xn = yn(bn), Sn = h({}, bn, {
		view: 0,
		detail: 0
	}), Cn = yn(Sn), wn, Tn, En, Dn = h({}, Sn, {
		screenX: 0,
		screenY: 0,
		clientX: 0,
		clientY: 0,
		pageX: 0,
		pageY: 0,
		ctrlKey: 0,
		shiftKey: 0,
		altKey: 0,
		metaKey: 0,
		getModifierState: Rn,
		button: 0,
		buttons: 0,
		relatedTarget: function(e) {
			return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
		},
		movementX: function(e) {
			return "movementX" in e ? e.movementX : (e !== En && (En && e.type === "mousemove" ? (wn = e.screenX - En.screenX, Tn = e.screenY - En.screenY) : Tn = wn = 0, En = e), wn);
		},
		movementY: function(e) {
			return "movementY" in e ? e.movementY : Tn;
		}
	}), On = yn(Dn), kn = yn(h({}, Dn, { dataTransfer: 0 })), An = yn(h({}, Sn, { relatedTarget: 0 })), jn = yn(h({}, bn, {
		animationName: 0,
		elapsedTime: 0,
		pseudoElement: 0
	})), Mn = yn(h({}, bn, { clipboardData: function(e) {
		return "clipboardData" in e ? e.clipboardData : window.clipboardData;
	} })), Nn = yn(h({}, bn, { data: 0 })), Pn = {
		Esc: "Escape",
		Spacebar: " ",
		Left: "ArrowLeft",
		Up: "ArrowUp",
		Right: "ArrowRight",
		Down: "ArrowDown",
		Del: "Delete",
		Win: "OS",
		Menu: "ContextMenu",
		Apps: "ContextMenu",
		Scroll: "ScrollLock",
		MozPrintableKey: "Unidentified"
	}, Fn = {
		8: "Backspace",
		9: "Tab",
		12: "Clear",
		13: "Enter",
		16: "Shift",
		17: "Control",
		18: "Alt",
		19: "Pause",
		20: "CapsLock",
		27: "Escape",
		32: " ",
		33: "PageUp",
		34: "PageDown",
		35: "End",
		36: "Home",
		37: "ArrowLeft",
		38: "ArrowUp",
		39: "ArrowRight",
		40: "ArrowDown",
		45: "Insert",
		46: "Delete",
		112: "F1",
		113: "F2",
		114: "F3",
		115: "F4",
		116: "F5",
		117: "F6",
		118: "F7",
		119: "F8",
		120: "F9",
		121: "F10",
		122: "F11",
		123: "F12",
		144: "NumLock",
		145: "ScrollLock",
		224: "Meta"
	}, In = {
		Alt: "altKey",
		Control: "ctrlKey",
		Meta: "metaKey",
		Shift: "shiftKey"
	};
	function Ln(e) {
		var t = this.nativeEvent;
		return t.getModifierState ? t.getModifierState(e) : (e = In[e]) ? !!t[e] : !1;
	}
	function Rn() {
		return Ln;
	}
	var zn = yn(h({}, Sn, {
		key: function(e) {
			if (e.key) {
				var t = Pn[e.key] || e.key;
				if (t !== "Unidentified") return t;
			}
			return e.type === "keypress" ? (e = gn(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? Fn[e.keyCode] || "Unidentified" : "";
		},
		code: 0,
		location: 0,
		ctrlKey: 0,
		shiftKey: 0,
		altKey: 0,
		metaKey: 0,
		repeat: 0,
		locale: 0,
		getModifierState: Rn,
		charCode: function(e) {
			return e.type === "keypress" ? gn(e) : 0;
		},
		keyCode: function(e) {
			return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
		},
		which: function(e) {
			return e.type === "keypress" ? gn(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
		}
	})), Bn = yn(h({}, Dn, {
		pointerId: 0,
		width: 0,
		height: 0,
		pressure: 0,
		tangentialPressure: 0,
		tiltX: 0,
		tiltY: 0,
		twist: 0,
		pointerType: 0,
		isPrimary: 0
	})), Vn = yn(h({}, Sn, {
		touches: 0,
		targetTouches: 0,
		changedTouches: 0,
		altKey: 0,
		metaKey: 0,
		ctrlKey: 0,
		shiftKey: 0,
		getModifierState: Rn
	})), Hn = yn(h({}, bn, {
		propertyName: 0,
		elapsedTime: 0,
		pseudoElement: 0
	})), Un = yn(h({}, Dn, {
		deltaX: function(e) {
			return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
		},
		deltaY: function(e) {
			return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
		},
		deltaZ: 0,
		deltaMode: 0
	})), Wn = yn(h({}, bn, {
		newState: 0,
		oldState: 0
	})), Gn = [
		9,
		13,
		27,
		32
	], Kn = ln && "CompositionEvent" in window, qn = null;
	ln && "documentMode" in document && (qn = document.documentMode);
	var Jn = ln && "TextEvent" in window && !qn, Yn = ln && (!Kn || qn && 8 < qn && 11 >= qn), Xn = " ", Zn = !1;
	function Qn(e, t) {
		switch (e) {
			case "keyup": return Gn.indexOf(t.keyCode) !== -1;
			case "keydown": return t.keyCode !== 229;
			case "keypress":
			case "mousedown":
			case "focusout": return !0;
			default: return !1;
		}
	}
	function $n(e) {
		return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
	}
	var er = !1;
	function tr(e, t) {
		switch (e) {
			case "compositionend": return $n(t);
			case "keypress": return t.which === 32 ? (Zn = !0, Xn) : null;
			case "textInput": return e = t.data, e === Xn && Zn ? null : e;
			default: return null;
		}
	}
	function nr(e, t) {
		if (er) return e === "compositionend" || !Kn && Qn(e, t) ? (e = hn(), mn = pn = fn = null, er = !1, e) : null;
		switch (e) {
			case "paste": return null;
			case "keypress":
				if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
					if (t.char && 1 < t.char.length) return t.char;
					if (t.which) return String.fromCharCode(t.which);
				}
				return null;
			case "compositionend": return Yn && t.locale !== "ko" ? null : t.data;
			default: return null;
		}
	}
	var rr = {
		color: !0,
		date: !0,
		datetime: !0,
		"datetime-local": !0,
		email: !0,
		month: !0,
		number: !0,
		password: !0,
		range: !0,
		search: !0,
		tel: !0,
		text: !0,
		time: !0,
		url: !0,
		week: !0
	};
	function ir(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return t === "input" ? !!rr[e.type] : t === "textarea";
	}
	function ar(e, t, n, r) {
		nn ? rn ? rn.push(r) : rn = [r] : nn = r, t = Ed(t, "onChange"), 0 < t.length && (n = new xn("onChange", "change", null, n, r), e.push({
			event: n,
			listeners: t
		}));
	}
	var or = null, sr = null;
	function cr(e) {
		yd(e, 0);
	}
	function lr(e) {
		if (It(vt(e))) return e;
	}
	function ur(e, t) {
		if (e === "change") return t;
	}
	var dr = !1;
	if (ln) {
		var fr;
		if (ln) {
			var pr = "oninput" in document;
			if (!pr) {
				var mr = document.createElement("div");
				mr.setAttribute("oninput", "return;"), pr = typeof mr.oninput == "function";
			}
			fr = pr;
		} else fr = !1;
		dr = fr && (!document.documentMode || 9 < document.documentMode);
	}
	function hr() {
		or && (or.detachEvent("onpropertychange", gr), sr = or = null);
	}
	function gr(e) {
		if (e.propertyName === "value" && lr(sr)) {
			var t = [];
			ar(t, sr, e, tn(e)), sn(cr, t);
		}
	}
	function _r(e, t, n) {
		e === "focusin" ? (hr(), or = t, sr = n, or.attachEvent("onpropertychange", gr)) : e === "focusout" && hr();
	}
	function vr(e) {
		if (e === "selectionchange" || e === "keyup" || e === "keydown") return lr(sr);
	}
	function yr(e, t) {
		if (e === "click") return lr(t);
	}
	function br(e, t) {
		if (e === "input" || e === "change") return lr(t);
	}
	function xr(e, t) {
		return e === t && (e !== 0 || 1 / e == 1 / t) || e !== e && t !== t;
	}
	var Sr = typeof Object.is == "function" ? Object.is : xr;
	function Cr(e, t) {
		if (Sr(e, t)) return !0;
		if (typeof e != "object" || !e || typeof t != "object" || !t) return !1;
		var n = Object.keys(e), r = Object.keys(t);
		if (n.length !== r.length) return !1;
		for (r = 0; r < n.length; r++) {
			var i = n[r];
			if (!we.call(t, i) || !Sr(e[i], t[i])) return !1;
		}
		return !0;
	}
	function wr(e) {
		for (; e && e.firstChild;) e = e.firstChild;
		return e;
	}
	function Tr(e, t) {
		var n = wr(e);
		e = 0;
		for (var r; n;) {
			if (n.nodeType === 3) {
				if (r = e + n.textContent.length, e <= t && r >= t) return {
					node: n,
					offset: t - e
				};
				e = r;
			}
			a: {
				for (; n;) {
					if (n.nextSibling) {
						n = n.nextSibling;
						break a;
					}
					n = n.parentNode;
				}
				n = void 0;
			}
			n = wr(n);
		}
	}
	function Er(e, t) {
		return e && t ? e === t ? !0 : e && e.nodeType === 3 ? !1 : t && t.nodeType === 3 ? Er(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : !1 : !1;
	}
	function Dr(e) {
		e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
		for (var t = Lt(e.document); t instanceof e.HTMLIFrameElement;) {
			try {
				var n = typeof t.contentWindow.location.href == "string";
			} catch {
				n = !1;
			}
			if (n) e = t.contentWindow;
			else break;
			t = Lt(e.document);
		}
		return t;
	}
	function Or(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
	}
	var kr = ln && "documentMode" in document && 11 >= document.documentMode, Ar = null, jr = null, Mr = null, Nr = !1;
	function Pr(e, t, n) {
		var r = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument;
		Nr || Ar == null || Ar !== Lt(r) || (r = Ar, "selectionStart" in r && Or(r) ? r = {
			start: r.selectionStart,
			end: r.selectionEnd
		} : (r = (r.ownerDocument && r.ownerDocument.defaultView || window).getSelection(), r = {
			anchorNode: r.anchorNode,
			anchorOffset: r.anchorOffset,
			focusNode: r.focusNode,
			focusOffset: r.focusOffset
		}), Mr && Cr(Mr, r) || (Mr = r, r = Ed(jr, "onSelect"), 0 < r.length && (t = new xn("onSelect", "select", null, t, n), e.push({
			event: t,
			listeners: r
		}), t.target = Ar)));
	}
	function Fr(e, t) {
		var n = {};
		return n[e.toLowerCase()] = t.toLowerCase(), n["Webkit" + e] = "webkit" + t, n["Moz" + e] = "moz" + t, n;
	}
	var Ir = {
		animationend: Fr("Animation", "AnimationEnd"),
		animationiteration: Fr("Animation", "AnimationIteration"),
		animationstart: Fr("Animation", "AnimationStart"),
		transitionrun: Fr("Transition", "TransitionRun"),
		transitionstart: Fr("Transition", "TransitionStart"),
		transitioncancel: Fr("Transition", "TransitionCancel"),
		transitionend: Fr("Transition", "TransitionEnd")
	}, Lr = {}, Rr = {};
	ln && (Rr = document.createElement("div").style, "AnimationEvent" in window || (delete Ir.animationend.animation, delete Ir.animationiteration.animation, delete Ir.animationstart.animation), "TransitionEvent" in window || delete Ir.transitionend.transition);
	function zr(e) {
		if (Lr[e]) return Lr[e];
		if (!Ir[e]) return e;
		var t = Ir[e], n;
		for (n in t) if (t.hasOwnProperty(n) && n in Rr) return Lr[e] = t[n];
		return e;
	}
	var Br = zr("animationend"), Vr = zr("animationiteration"), Hr = zr("animationstart"), Ur = zr("transitionrun"), Wr = zr("transitionstart"), Gr = zr("transitioncancel"), Kr = zr("transitionend"), qr = /* @__PURE__ */ new Map(), Jr = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
	Jr.push("scrollEnd");
	function Yr(e, t) {
		qr.set(e, t), Ct(t, [e]);
	}
	var Xr = typeof reportError == "function" ? reportError : function(e) {
		if (typeof window == "object" && typeof window.ErrorEvent == "function") {
			var t = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: typeof e == "object" && e && typeof e.message == "string" ? String(e.message) : String(e),
				error: e
			});
			if (!window.dispatchEvent(t)) return;
		} else if (typeof process == "object" && typeof process.emit == "function") {
			process.emit("uncaughtException", e);
			return;
		}
		console.error(e);
	}, Zr = [], Qr = 0, $r = 0;
	function ei() {
		for (var e = Qr, t = $r = Qr = 0; t < e;) {
			var n = Zr[t];
			Zr[t++] = null;
			var r = Zr[t];
			Zr[t++] = null;
			var i = Zr[t];
			Zr[t++] = null;
			var a = Zr[t];
			if (Zr[t++] = null, r !== null && i !== null) {
				var o = r.pending;
				o === null ? i.next = i : (i.next = o.next, o.next = i), r.pending = i;
			}
			a !== 0 && ii(n, i, a);
		}
	}
	function ti(e, t, n, r) {
		Zr[Qr++] = e, Zr[Qr++] = t, Zr[Qr++] = n, Zr[Qr++] = r, $r |= r, e.lanes |= r, e = e.alternate, e !== null && (e.lanes |= r);
	}
	function ni(e, t, n, r) {
		return ti(e, t, n, r), ai(e);
	}
	function ri(e, t) {
		return ti(e, null, null, t), ai(e);
	}
	function ii(e, t, n) {
		e.lanes |= n;
		var r = e.alternate;
		r !== null && (r.lanes |= n);
		for (var i = !1, a = e.return; a !== null;) a.childLanes |= n, r = a.alternate, r !== null && (r.childLanes |= n), a.tag === 22 && (e = a.stateNode, e === null || e._visibility & 1 || (i = !0)), e = a, a = a.return;
		return e.tag === 3 ? (a = e.stateNode, i && t !== null && (i = 31 - Ve(n), e = a.hiddenUpdates, r = e[i], r === null ? e[i] = [t] : r.push(t), t.lane = n | 536870912), a) : null;
	}
	function ai(e) {
		if (50 < du) throw du = 0, fu = null, Error(i(185));
		for (var t = e.return; t !== null;) e = t, t = e.return;
		return e.tag === 3 ? e.stateNode : null;
	}
	var oi = {};
	function si(e, t, n, r) {
		this.tag = e, this.key = n, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = r, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
	}
	function z(e, t, n, r) {
		return new si(e, t, n, r);
	}
	function ci(e) {
		return e = e.prototype, !(!e || !e.isReactComponent);
	}
	function li(e, t) {
		var n = e.alternate;
		return n === null ? (n = z(e.tag, t, e.key, e.mode), n.elementType = e.elementType, n.type = e.type, n.stateNode = e.stateNode, n.alternate = e, e.alternate = n) : (n.pendingProps = t, n.type = e.type, n.flags = 0, n.subtreeFlags = 0, n.deletions = null), n.flags = e.flags & 65011712, n.childLanes = e.childLanes, n.lanes = e.lanes, n.child = e.child, n.memoizedProps = e.memoizedProps, n.memoizedState = e.memoizedState, n.updateQueue = e.updateQueue, t = e.dependencies, n.dependencies = t === null ? null : {
			lanes: t.lanes,
			firstContext: t.firstContext
		}, n.sibling = e.sibling, n.index = e.index, n.ref = e.ref, n.refCleanup = e.refCleanup, n;
	}
	function ui(e, t) {
		e.flags &= 65011714;
		var n = e.alternate;
		return n === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = n.childLanes, e.lanes = n.lanes, e.child = n.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = n.memoizedProps, e.memoizedState = n.memoizedState, e.updateQueue = n.updateQueue, e.type = n.type, t = n.dependencies, e.dependencies = t === null ? null : {
			lanes: t.lanes,
			firstContext: t.firstContext
		}), e;
	}
	function di(e, t, n, r, a, o) {
		var s = 0;
		if (r = e, typeof e == "function") ci(e) && (s = 1);
		else if (typeof e == "string") s = Uf(e, n, ue.current) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
		else a: switch (e) {
			case te: return e = z(31, n, t, a), e.elementType = te, e.lanes = o, e;
			case y: return fi(n.children, a, o, t);
			case b:
				s = 8, a |= 24;
				break;
			case x: return e = z(12, n, t, a | 2), e.elementType = x, e.lanes = o, e;
			case T: return e = z(13, n, t, a), e.elementType = T, e.lanes = o, e;
			case ee: return e = z(19, n, t, a), e.elementType = ee, e.lanes = o, e;
			default:
				if (typeof e == "object" && e) switch (e.$$typeof) {
					case C:
						s = 10;
						break a;
					case S:
						s = 9;
						break a;
					case w:
						s = 11;
						break a;
					case E:
						s = 14;
						break a;
					case D:
						s = 16, r = null;
						break a;
				}
				s = 29, n = Error(i(130, e === null ? "null" : typeof e, "")), r = null;
		}
		return t = z(s, n, t, a), t.elementType = e, t.type = r, t.lanes = o, t;
	}
	function fi(e, t, n, r) {
		return e = z(7, e, r, t), e.lanes = n, e;
	}
	function pi(e, t, n) {
		return e = z(6, e, null, t), e.lanes = n, e;
	}
	function mi(e) {
		var t = z(18, null, null, 0);
		return t.stateNode = e, t;
	}
	function hi(e, t, n) {
		return t = z(4, e.children === null ? [] : e.children, e.key, t), t.lanes = n, t.stateNode = {
			containerInfo: e.containerInfo,
			pendingChildren: null,
			implementation: e.implementation
		}, t;
	}
	var gi = /* @__PURE__ */ new WeakMap();
	function _i(e, t) {
		if (typeof e == "object" && e) {
			var n = gi.get(e);
			return n === void 0 ? (t = {
				value: e,
				source: t,
				stack: Ce(t)
			}, gi.set(e, t), t) : n;
		}
		return {
			value: e,
			source: t,
			stack: Ce(t)
		};
	}
	var vi = [], yi = 0, bi = null, xi = 0, Si = [], Ci = 0, wi = null, Ti = 1, Ei = "";
	function Di(e, t) {
		vi[yi++] = xi, vi[yi++] = bi, bi = e, xi = t;
	}
	function Oi(e, t, n) {
		Si[Ci++] = Ti, Si[Ci++] = Ei, Si[Ci++] = wi, wi = e;
		var r = Ti;
		e = Ei;
		var i = 32 - Ve(r) - 1;
		r &= ~(1 << i), n += 1;
		var a = 32 - Ve(t) + i;
		if (30 < a) {
			var o = i - i % 5;
			a = (r & (1 << o) - 1).toString(32), r >>= o, i -= o, Ti = 1 << 32 - Ve(t) + i | n << i | r, Ei = a + e;
		} else Ti = 1 << a | n << i | r, Ei = e;
	}
	function ki(e) {
		e.return !== null && (Di(e, 1), Oi(e, 1, 0));
	}
	function Ai(e) {
		for (; e === bi;) bi = vi[--yi], vi[yi] = null, xi = vi[--yi], vi[yi] = null;
		for (; e === wi;) wi = Si[--Ci], Si[Ci] = null, Ei = Si[--Ci], Si[Ci] = null, Ti = Si[--Ci], Si[Ci] = null;
	}
	function ji(e, t) {
		Si[Ci++] = Ti, Si[Ci++] = Ei, Si[Ci++] = wi, Ti = t.id, Ei = t.overflow, wi = e;
	}
	var Mi = null, B = null, V = !1, Ni = null, Pi = !1, Fi = Error(i(519));
	function Ii(e) {
		throw Hi(_i(Error(i(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", "")), e)), Fi;
	}
	function Li(e) {
		var t = e.stateNode, n = e.type, r = e.memoizedProps;
		switch (t[lt] = e, t[ut] = r, n) {
			case "dialog":
				Q("cancel", t), Q("close", t);
				break;
			case "iframe":
			case "object":
			case "embed":
				Q("load", t);
				break;
			case "video":
			case "audio":
				for (n = 0; n < _d.length; n++) Q(_d[n], t);
				break;
			case "source":
				Q("error", t);
				break;
			case "img":
			case "image":
			case "link":
				Q("error", t), Q("load", t);
				break;
			case "details":
				Q("toggle", t);
				break;
			case "input":
				Q("invalid", t), Bt(t, r.value, r.defaultValue, r.checked, r.defaultChecked, r.type, r.name, !0);
				break;
			case "select":
				Q("invalid", t);
				break;
			case "textarea": Q("invalid", t), Wt(t, r.value, r.defaultValue, r.children);
		}
		n = r.children, typeof n != "string" && typeof n != "number" && typeof n != "bigint" || t.textContent === "" + n || !0 === r.suppressHydrationWarning || Md(t.textContent, n) ? (r.popover != null && (Q("beforetoggle", t), Q("toggle", t)), r.onScroll != null && Q("scroll", t), r.onScrollEnd != null && Q("scrollend", t), r.onClick != null && (t.onclick = $t), t = !0) : t = !1, t || Ii(e, !0);
	}
	function Ri(e) {
		for (Mi = e.return; Mi;) switch (Mi.tag) {
			case 5:
			case 31:
			case 13:
				Pi = !1;
				return;
			case 27:
			case 3:
				Pi = !0;
				return;
			default: Mi = Mi.return;
		}
	}
	function zi(e) {
		if (e !== Mi) return !1;
		if (!V) return Ri(e), V = !0, !1;
		var t = e.tag, n;
		if ((n = t !== 3 && t !== 27) && ((n = t === 5) && (n = e.type, n = !(n !== "form" && n !== "button") || Ud(e.type, e.memoizedProps)), n = !n), n && B && Ii(e), Ri(e), t === 13) {
			if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(317));
			B = uf(e);
		} else if (t === 31) {
			if (e = e.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(317));
			B = uf(e);
		} else t === 27 ? (t = B, Zd(e.type) ? (e = lf, lf = null, B = e) : B = t) : B = Mi ? cf(e.stateNode.nextSibling) : null;
		return !0;
	}
	function Bi() {
		B = Mi = null, V = !1;
	}
	function Vi() {
		var e = Ni;
		return e !== null && (Zl === null ? Zl = e : Zl.push.apply(Zl, e), Ni = null), e;
	}
	function Hi(e) {
		Ni === null ? Ni = [e] : Ni.push(e);
	}
	var Ui = j(null), Wi = null, Gi = null;
	function Ki(e, t, n) {
		N(Ui, t._currentValue), t._currentValue = n;
	}
	function qi(e) {
		e._currentValue = Ui.current, M(Ui);
	}
	function Ji(e, t, n) {
		for (; e !== null;) {
			var r = e.alternate;
			if ((e.childLanes & t) === t ? r !== null && (r.childLanes & t) !== t && (r.childLanes |= t) : (e.childLanes |= t, r !== null && (r.childLanes |= t)), e === n) break;
			e = e.return;
		}
	}
	function Yi(e, t, n, r) {
		var a = e.child;
		for (a !== null && (a.return = e); a !== null;) {
			var o = a.dependencies;
			if (o !== null) {
				var s = a.child;
				o = o.firstContext;
				a: for (; o !== null;) {
					var c = o;
					o = a;
					for (var l = 0; l < t.length; l++) if (c.context === t[l]) {
						o.lanes |= n, c = o.alternate, c !== null && (c.lanes |= n), Ji(o.return, n, e), r || (s = null);
						break a;
					}
					o = c.next;
				}
			} else if (a.tag === 18) {
				if (s = a.return, s === null) throw Error(i(341));
				s.lanes |= n, o = s.alternate, o !== null && (o.lanes |= n), Ji(s, n, e), s = null;
			} else s = a.child;
			if (s !== null) s.return = a;
			else for (s = a; s !== null;) {
				if (s === e) {
					s = null;
					break;
				}
				if (a = s.sibling, a !== null) {
					a.return = s.return, s = a;
					break;
				}
				s = s.return;
			}
			a = s;
		}
	}
	function Xi(e, t, n, r) {
		e = null;
		for (var a = t, o = !1; a !== null;) {
			if (!o) {
				if (a.flags & 524288) o = !0;
				else if (a.flags & 262144) break;
			}
			if (a.tag === 10) {
				var s = a.alternate;
				if (s === null) throw Error(i(387));
				if (s = s.memoizedProps, s !== null) {
					var c = a.type;
					Sr(a.pendingProps.value, s.value) || (e === null ? e = [c] : e.push(c));
				}
			} else if (a === fe.current) {
				if (s = a.alternate, s === null) throw Error(i(387));
				s.memoizedState.memoizedState !== a.memoizedState.memoizedState && (e === null ? e = [Qf] : e.push(Qf));
			}
			a = a.return;
		}
		e !== null && Yi(t, e, n, r), t.flags |= 262144;
	}
	function Zi(e) {
		for (e = e.firstContext; e !== null;) {
			if (!Sr(e.context._currentValue, e.memoizedValue)) return !0;
			e = e.next;
		}
		return !1;
	}
	function Qi(e) {
		Wi = e, Gi = null, e = e.dependencies, e !== null && (e.firstContext = null);
	}
	function $i(e) {
		return ta(Wi, e);
	}
	function ea(e, t) {
		return Wi === null && Qi(e), ta(e, t);
	}
	function ta(e, t) {
		var n = t._currentValue;
		if (t = {
			context: t,
			memoizedValue: n,
			next: null
		}, Gi === null) {
			if (e === null) throw Error(i(308));
			Gi = t, e.dependencies = {
				lanes: 0,
				firstContext: t
			}, e.flags |= 524288;
		} else Gi = Gi.next = t;
		return n;
	}
	var na = typeof AbortController < "u" ? AbortController : function() {
		var e = [], t = this.signal = {
			aborted: !1,
			addEventListener: function(t, n) {
				e.push(n);
			}
		};
		this.abort = function() {
			t.aborted = !0, e.forEach(function(e) {
				return e();
			});
		};
	}, ra = t.unstable_scheduleCallback, ia = t.unstable_NormalPriority, aa = {
		$$typeof: C,
		Consumer: null,
		Provider: null,
		_currentValue: null,
		_currentValue2: null,
		_threadCount: 0
	};
	function oa() {
		return {
			controller: new na(),
			data: /* @__PURE__ */ new Map(),
			refCount: 0
		};
	}
	function sa(e) {
		e.refCount--, e.refCount === 0 && ra(ia, function() {
			e.controller.abort();
		});
	}
	var ca = null, la = 0, ua = 0, da = null;
	function fa(e, t) {
		if (ca === null) {
			var n = ca = [];
			la = 0, ua = dd(), da = {
				status: "pending",
				value: void 0,
				then: function(e) {
					n.push(e);
				}
			};
		}
		return la++, t.then(pa, pa), t;
	}
	function pa() {
		if (--la === 0 && ca !== null) {
			da !== null && (da.status = "fulfilled");
			var e = ca;
			ca = null, ua = 0, da = null;
			for (var t = 0; t < e.length; t++) (0, e[t])();
		}
	}
	function ma(e, t) {
		var n = [], r = {
			status: "pending",
			value: null,
			reason: null,
			then: function(e) {
				n.push(e);
			}
		};
		return e.then(function() {
			r.status = "fulfilled", r.value = t;
			for (var e = 0; e < n.length; e++) (0, n[e])(t);
		}, function(e) {
			for (r.status = "rejected", r.reason = e, e = 0; e < n.length; e++) (0, n[e])(void 0);
		}), r;
	}
	var ha = k.S;
	k.S = function(e, t) {
		eu = ke(), typeof t == "object" && t && typeof t.then == "function" && fa(e, t), ha !== null && ha(e, t);
	};
	var ga = j(null);
	function _a() {
		var e = ga.current;
		return e === null ? q.pooledCache : e;
	}
	function va(e, t) {
		t === null ? N(ga, ga.current) : N(ga, t.pool);
	}
	function ya() {
		var e = _a();
		return e === null ? null : {
			parent: aa._currentValue,
			pool: e
		};
	}
	var ba = Error(i(460)), xa = Error(i(474)), Sa = Error(i(542)), Ca = { then: function() {} };
	function wa(e) {
		return e = e.status, e === "fulfilled" || e === "rejected";
	}
	function Ta(e, t, n) {
		switch (n = e[n], n === void 0 ? e.push(t) : n !== t && (t.then($t, $t), t = n), t.status) {
			case "fulfilled": return t.value;
			case "rejected": throw e = t.reason, ka(e), e;
			default:
				if (typeof t.status == "string") t.then($t, $t);
				else {
					if (e = q, e !== null && 100 < e.shellSuspendCounter) throw Error(i(482));
					e = t, e.status = "pending", e.then(function(e) {
						if (t.status === "pending") {
							var n = t;
							n.status = "fulfilled", n.value = e;
						}
					}, function(e) {
						if (t.status === "pending") {
							var n = t;
							n.status = "rejected", n.reason = e;
						}
					});
				}
				switch (t.status) {
					case "fulfilled": return t.value;
					case "rejected": throw e = t.reason, ka(e), e;
				}
				throw Da = t, ba;
		}
	}
	function Ea(e) {
		try {
			var t = e._init;
			return t(e._payload);
		} catch (e) {
			throw typeof e == "object" && e && typeof e.then == "function" ? (Da = e, ba) : e;
		}
	}
	var Da = null;
	function Oa() {
		if (Da === null) throw Error(i(459));
		var e = Da;
		return Da = null, e;
	}
	function ka(e) {
		if (e === ba || e === Sa) throw Error(i(483));
	}
	var Aa = null, ja = 0;
	function Ma(e) {
		var t = ja;
		return ja += 1, Aa === null && (Aa = []), Ta(Aa, e, t);
	}
	function Na(e, t) {
		t = t.props.ref, e.ref = t === void 0 ? null : t;
	}
	function Pa(e, t) {
		throw t.$$typeof === g ? Error(i(525)) : (e = Object.prototype.toString.call(t), Error(i(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e)));
	}
	function Fa(e) {
		function t(t, n) {
			if (e) {
				var r = t.deletions;
				r === null ? (t.deletions = [n], t.flags |= 16) : r.push(n);
			}
		}
		function n(n, r) {
			if (!e) return null;
			for (; r !== null;) t(n, r), r = r.sibling;
			return null;
		}
		function r(e) {
			for (var t = /* @__PURE__ */ new Map(); e !== null;) e.key === null ? t.set(e.index, e) : t.set(e.key, e), e = e.sibling;
			return t;
		}
		function a(e, t) {
			return e = li(e, t), e.index = 0, e.sibling = null, e;
		}
		function o(t, n, r) {
			return t.index = r, e ? (r = t.alternate, r === null ? (t.flags |= 67108866, n) : (r = r.index, r < n ? (t.flags |= 67108866, n) : r)) : (t.flags |= 1048576, n);
		}
		function s(t) {
			return e && t.alternate === null && (t.flags |= 67108866), t;
		}
		function c(e, t, n, r) {
			return t === null || t.tag !== 6 ? (t = pi(n, e.mode, r), t.return = e, t) : (t = a(t, n), t.return = e, t);
		}
		function l(e, t, n, r) {
			var i = n.type;
			return i === y ? d(e, t, n.props.children, r, n.key) : t !== null && (t.elementType === i || typeof i == "object" && i && i.$$typeof === D && Ea(i) === t.type) ? (t = a(t, n.props), Na(t, n), t.return = e, t) : (t = di(n.type, n.key, n.props, null, e.mode, r), Na(t, n), t.return = e, t);
		}
		function u(e, t, n, r) {
			return t === null || t.tag !== 4 || t.stateNode.containerInfo !== n.containerInfo || t.stateNode.implementation !== n.implementation ? (t = hi(n, e.mode, r), t.return = e, t) : (t = a(t, n.children || []), t.return = e, t);
		}
		function d(e, t, n, r, i) {
			return t === null || t.tag !== 7 ? (t = fi(n, e.mode, r, i), t.return = e, t) : (t = a(t, n), t.return = e, t);
		}
		function f(e, t, n) {
			if (typeof t == "string" && t !== "" || typeof t == "number" || typeof t == "bigint") return t = pi("" + t, e.mode, n), t.return = e, t;
			if (typeof t == "object" && t) {
				switch (t.$$typeof) {
					case _: return n = di(t.type, t.key, t.props, null, e.mode, n), Na(n, t), n.return = e, n;
					case v: return t = hi(t, e.mode, n), t.return = e, t;
					case D: return t = Ea(t), f(e, t, n);
				}
				if (oe(t) || O(t)) return t = fi(t, e.mode, n, null), t.return = e, t;
				if (typeof t.then == "function") return f(e, Ma(t), n);
				if (t.$$typeof === C) return f(e, ea(e, t), n);
				Pa(e, t);
			}
			return null;
		}
		function p(e, t, n, r) {
			var i = t === null ? null : t.key;
			if (typeof n == "string" && n !== "" || typeof n == "number" || typeof n == "bigint") return i === null ? c(e, t, "" + n, r) : null;
			if (typeof n == "object" && n) {
				switch (n.$$typeof) {
					case _: return n.key === i ? l(e, t, n, r) : null;
					case v: return n.key === i ? u(e, t, n, r) : null;
					case D: return n = Ea(n), p(e, t, n, r);
				}
				if (oe(n) || O(n)) return i === null ? d(e, t, n, r, null) : null;
				if (typeof n.then == "function") return p(e, t, Ma(n), r);
				if (n.$$typeof === C) return p(e, t, ea(e, n), r);
				Pa(e, n);
			}
			return null;
		}
		function m(e, t, n, r, i) {
			if (typeof r == "string" && r !== "" || typeof r == "number" || typeof r == "bigint") return e = e.get(n) || null, c(t, e, "" + r, i);
			if (typeof r == "object" && r) {
				switch (r.$$typeof) {
					case _: return e = e.get(r.key === null ? n : r.key) || null, l(t, e, r, i);
					case v: return e = e.get(r.key === null ? n : r.key) || null, u(t, e, r, i);
					case D: return r = Ea(r), m(e, t, n, r, i);
				}
				if (oe(r) || O(r)) return e = e.get(n) || null, d(t, e, r, i, null);
				if (typeof r.then == "function") return m(e, t, n, Ma(r), i);
				if (r.$$typeof === C) return m(e, t, n, ea(t, r), i);
				Pa(t, r);
			}
			return null;
		}
		function h(i, a, s, c) {
			for (var l = null, u = null, d = a, h = a = 0, g = null; d !== null && h < s.length; h++) {
				d.index > h ? (g = d, d = null) : g = d.sibling;
				var _ = p(i, d, s[h], c);
				if (_ === null) {
					d === null && (d = g);
					break;
				}
				e && d && _.alternate === null && t(i, d), a = o(_, a, h), u === null ? l = _ : u.sibling = _, u = _, d = g;
			}
			if (h === s.length) return n(i, d), V && Di(i, h), l;
			if (d === null) {
				for (; h < s.length; h++) d = f(i, s[h], c), d !== null && (a = o(d, a, h), u === null ? l = d : u.sibling = d, u = d);
				return V && Di(i, h), l;
			}
			for (d = r(d); h < s.length; h++) g = m(d, i, h, s[h], c), g !== null && (e && g.alternate !== null && d.delete(g.key === null ? h : g.key), a = o(g, a, h), u === null ? l = g : u.sibling = g, u = g);
			return e && d.forEach(function(e) {
				return t(i, e);
			}), V && Di(i, h), l;
		}
		function g(a, s, c, l) {
			if (c == null) throw Error(i(151));
			for (var u = null, d = null, h = s, g = s = 0, _ = null, v = c.next(); h !== null && !v.done; g++, v = c.next()) {
				h.index > g ? (_ = h, h = null) : _ = h.sibling;
				var y = p(a, h, v.value, l);
				if (y === null) {
					h === null && (h = _);
					break;
				}
				e && h && y.alternate === null && t(a, h), s = o(y, s, g), d === null ? u = y : d.sibling = y, d = y, h = _;
			}
			if (v.done) return n(a, h), V && Di(a, g), u;
			if (h === null) {
				for (; !v.done; g++, v = c.next()) v = f(a, v.value, l), v !== null && (s = o(v, s, g), d === null ? u = v : d.sibling = v, d = v);
				return V && Di(a, g), u;
			}
			for (h = r(h); !v.done; g++, v = c.next()) v = m(h, a, g, v.value, l), v !== null && (e && v.alternate !== null && h.delete(v.key === null ? g : v.key), s = o(v, s, g), d === null ? u = v : d.sibling = v, d = v);
			return e && h.forEach(function(e) {
				return t(a, e);
			}), V && Di(a, g), u;
		}
		function b(e, r, o, c) {
			if (typeof o == "object" && o && o.type === y && o.key === null && (o = o.props.children), typeof o == "object" && o) {
				switch (o.$$typeof) {
					case _:
						a: {
							for (var l = o.key; r !== null;) {
								if (r.key === l) {
									if (l = o.type, l === y) {
										if (r.tag === 7) {
											n(e, r.sibling), c = a(r, o.props.children), c.return = e, e = c;
											break a;
										}
									} else if (r.elementType === l || typeof l == "object" && l && l.$$typeof === D && Ea(l) === r.type) {
										n(e, r.sibling), c = a(r, o.props), Na(c, o), c.return = e, e = c;
										break a;
									}
									n(e, r);
									break;
								} else t(e, r);
								r = r.sibling;
							}
							o.type === y ? (c = fi(o.props.children, e.mode, c, o.key), c.return = e, e = c) : (c = di(o.type, o.key, o.props, null, e.mode, c), Na(c, o), c.return = e, e = c);
						}
						return s(e);
					case v:
						a: {
							for (l = o.key; r !== null;) {
								if (r.key === l) if (r.tag === 4 && r.stateNode.containerInfo === o.containerInfo && r.stateNode.implementation === o.implementation) {
									n(e, r.sibling), c = a(r, o.children || []), c.return = e, e = c;
									break a;
								} else {
									n(e, r);
									break;
								}
								else t(e, r);
								r = r.sibling;
							}
							c = hi(o, e.mode, c), c.return = e, e = c;
						}
						return s(e);
					case D: return o = Ea(o), b(e, r, o, c);
				}
				if (oe(o)) return h(e, r, o, c);
				if (O(o)) {
					if (l = O(o), typeof l != "function") throw Error(i(150));
					return o = l.call(o), g(e, r, o, c);
				}
				if (typeof o.then == "function") return b(e, r, Ma(o), c);
				if (o.$$typeof === C) return b(e, r, ea(e, o), c);
				Pa(e, o);
			}
			return typeof o == "string" && o !== "" || typeof o == "number" || typeof o == "bigint" ? (o = "" + o, r !== null && r.tag === 6 ? (n(e, r.sibling), c = a(r, o), c.return = e, e = c) : (n(e, r), c = pi(o, e.mode, c), c.return = e, e = c), s(e)) : n(e, r);
		}
		return function(e, t, n, r) {
			try {
				ja = 0;
				var i = b(e, t, n, r);
				return Aa = null, i;
			} catch (t) {
				if (t === ba || t === Sa) throw t;
				var a = z(29, t, null, e.mode);
				return a.lanes = r, a.return = e, a;
			}
		};
	}
	var Ia = Fa(!0), La = Fa(!1), Ra = !1;
	function za(e) {
		e.updateQueue = {
			baseState: e.memoizedState,
			firstBaseUpdate: null,
			lastBaseUpdate: null,
			shared: {
				pending: null,
				lanes: 0,
				hiddenCallbacks: null
			},
			callbacks: null
		};
	}
	function Ba(e, t) {
		e = e.updateQueue, t.updateQueue === e && (t.updateQueue = {
			baseState: e.baseState,
			firstBaseUpdate: e.firstBaseUpdate,
			lastBaseUpdate: e.lastBaseUpdate,
			shared: e.shared,
			callbacks: null
		});
	}
	function Va(e) {
		return {
			lane: e,
			tag: 0,
			payload: null,
			callback: null,
			next: null
		};
	}
	function Ha(e, t, n) {
		var r = e.updateQueue;
		if (r === null) return null;
		if (r = r.shared, K & 2) {
			var i = r.pending;
			return i === null ? t.next = t : (t.next = i.next, i.next = t), r.pending = t, t = ai(e), ii(e, null, n), t;
		}
		return ti(e, r, t, n), ai(e);
	}
	function Ua(e, t, n) {
		if (t = t.updateQueue, t !== null && (t = t.shared, n & 4194048)) {
			var r = t.lanes;
			r &= e.pendingLanes, n |= r, t.lanes = n, nt(e, n);
		}
	}
	function Wa(e, t) {
		var n = e.updateQueue, r = e.alternate;
		if (r !== null && (r = r.updateQueue, n === r)) {
			var i = null, a = null;
			if (n = n.firstBaseUpdate, n !== null) {
				do {
					var o = {
						lane: n.lane,
						tag: n.tag,
						payload: n.payload,
						callback: null,
						next: null
					};
					a === null ? i = a = o : a = a.next = o, n = n.next;
				} while (n !== null);
				a === null ? i = a = t : a = a.next = t;
			} else i = a = t;
			n = {
				baseState: r.baseState,
				firstBaseUpdate: i,
				lastBaseUpdate: a,
				shared: r.shared,
				callbacks: r.callbacks
			}, e.updateQueue = n;
			return;
		}
		e = n.lastBaseUpdate, e === null ? n.firstBaseUpdate = t : e.next = t, n.lastBaseUpdate = t;
	}
	var Ga = !1;
	function Ka() {
		if (Ga) {
			var e = da;
			if (e !== null) throw e;
		}
	}
	function qa(e, t, n, r) {
		Ga = !1;
		var i = e.updateQueue;
		Ra = !1;
		var a = i.firstBaseUpdate, o = i.lastBaseUpdate, s = i.shared.pending;
		if (s !== null) {
			i.shared.pending = null;
			var c = s, l = c.next;
			c.next = null, o === null ? a = l : o.next = l, o = c;
			var u = e.alternate;
			u !== null && (u = u.updateQueue, s = u.lastBaseUpdate, s !== o && (s === null ? u.firstBaseUpdate = l : s.next = l, u.lastBaseUpdate = c));
		}
		if (a !== null) {
			var d = i.baseState;
			o = 0, u = l = c = null, s = a;
			do {
				var f = s.lane & -536870913, p = f !== s.lane;
				if (p ? (Y & f) === f : (r & f) === f) {
					f !== 0 && f === ua && (Ga = !0), u !== null && (u = u.next = {
						lane: 0,
						tag: s.tag,
						payload: s.payload,
						callback: null,
						next: null
					});
					a: {
						var m = e, g = s;
						f = t;
						var _ = n;
						switch (g.tag) {
							case 1:
								if (m = g.payload, typeof m == "function") {
									d = m.call(_, d, f);
									break a;
								}
								d = m;
								break a;
							case 3: m.flags = m.flags & -65537 | 128;
							case 0:
								if (m = g.payload, f = typeof m == "function" ? m.call(_, d, f) : m, f == null) break a;
								d = h({}, d, f);
								break a;
							case 2: Ra = !0;
						}
					}
					f = s.callback, f !== null && (e.flags |= 64, p && (e.flags |= 8192), p = i.callbacks, p === null ? i.callbacks = [f] : p.push(f));
				} else p = {
					lane: f,
					tag: s.tag,
					payload: s.payload,
					callback: s.callback,
					next: null
				}, u === null ? (l = u = p, c = d) : u = u.next = p, o |= f;
				if (s = s.next, s === null) {
					if (s = i.shared.pending, s === null) break;
					p = s, s = p.next, p.next = null, i.lastBaseUpdate = p, i.shared.pending = null;
				}
			} while (1);
			u === null && (c = d), i.baseState = c, i.firstBaseUpdate = l, i.lastBaseUpdate = u, a === null && (i.shared.lanes = 0), Gl |= o, e.lanes = o, e.memoizedState = d;
		}
	}
	function Ja(e, t) {
		if (typeof e != "function") throw Error(i(191, e));
		e.call(t);
	}
	function Ya(e, t) {
		var n = e.callbacks;
		if (n !== null) for (e.callbacks = null, e = 0; e < n.length; e++) Ja(n[e], t);
	}
	var Xa = j(null), Za = j(0);
	function Qa(e, t) {
		e = Ul, N(Za, e), N(Xa, t), Ul = e | t.baseLanes;
	}
	function $a() {
		N(Za, Ul), N(Xa, Xa.current);
	}
	function eo() {
		Ul = Za.current, M(Xa), M(Za);
	}
	var to = j(null), no = null;
	function ro(e) {
		var t = e.alternate;
		N(co, co.current & 1), N(to, e), no === null && (t === null || Xa.current !== null || t.memoizedState !== null) && (no = e);
	}
	function io(e) {
		N(co, co.current), N(to, e), no === null && (no = e);
	}
	function ao(e) {
		e.tag === 22 ? (N(co, co.current), N(to, e), no === null && (no = e)) : oo(e);
	}
	function oo() {
		N(co, co.current), N(to, to.current);
	}
	function so(e) {
		M(to), no === e && (no = null), M(co);
	}
	var co = j(0);
	function lo(e) {
		for (var t = e; t !== null;) {
			if (t.tag === 13) {
				var n = t.memoizedState;
				if (n !== null && (n = n.dehydrated, n === null || af(n) || of(n))) return t;
			} else if (t.tag === 19 && (t.memoizedProps.revealOrder === "forwards" || t.memoizedProps.revealOrder === "backwards" || t.memoizedProps.revealOrder === "unstable_legacy-backwards" || t.memoizedProps.revealOrder === "together")) {
				if (t.flags & 128) return t;
			} else if (t.child !== null) {
				t.child.return = t, t = t.child;
				continue;
			}
			if (t === e) break;
			for (; t.sibling === null;) {
				if (t.return === null || t.return === e) return null;
				t = t.return;
			}
			t.sibling.return = t.return, t = t.sibling;
		}
		return null;
	}
	var uo = 0, H = null, U = null, fo = null, po = !1, mo = !1, ho = !1, go = 0, _o = 0, vo = null, yo = 0;
	function bo() {
		throw Error(i(321));
	}
	function xo(e, t) {
		if (t === null) return !1;
		for (var n = 0; n < t.length && n < e.length; n++) if (!Sr(e[n], t[n])) return !1;
		return !0;
	}
	function So(e, t, n, r, i, a) {
		return uo = a, H = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, k.H = e === null || e.memoizedState === null ? zs : Bs, ho = !1, a = n(r, i), ho = !1, mo && (a = wo(t, n, r, i)), Co(e), a;
	}
	function Co(e) {
		k.H = Rs;
		var t = U !== null && U.next !== null;
		if (uo = 0, fo = U = H = null, po = !1, _o = 0, vo = null, t) throw Error(i(300));
		e === null || rc || (e = e.dependencies, e !== null && Zi(e) && (rc = !0));
	}
	function wo(e, t, n, r) {
		H = e;
		var a = 0;
		do {
			if (mo && (vo = null), _o = 0, mo = !1, 25 <= a) throw Error(i(301));
			if (a += 1, fo = U = null, e.updateQueue != null) {
				var o = e.updateQueue;
				o.lastEffect = null, o.events = null, o.stores = null, o.memoCache != null && (o.memoCache.index = 0);
			}
			k.H = Vs, o = t(n, r);
		} while (mo);
		return o;
	}
	function To() {
		var e = k.H, t = e.useState()[0];
		return t = typeof t.then == "function" ? Mo(t) : t, e = e.useState()[0], (U === null ? null : U.memoizedState) !== e && (H.flags |= 1024), t;
	}
	function Eo() {
		var e = go !== 0;
		return go = 0, e;
	}
	function Do(e, t, n) {
		t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~n;
	}
	function Oo(e) {
		if (po) {
			for (e = e.memoizedState; e !== null;) {
				var t = e.queue;
				t !== null && (t.pending = null), e = e.next;
			}
			po = !1;
		}
		uo = 0, fo = U = H = null, mo = !1, _o = go = 0, vo = null;
	}
	function ko() {
		var e = {
			memoizedState: null,
			baseState: null,
			baseQueue: null,
			queue: null,
			next: null
		};
		return fo === null ? H.memoizedState = fo = e : fo = fo.next = e, fo;
	}
	function Ao() {
		if (U === null) {
			var e = H.alternate;
			e = e === null ? null : e.memoizedState;
		} else e = U.next;
		var t = fo === null ? H.memoizedState : fo.next;
		if (t !== null) fo = t, U = e;
		else {
			if (e === null) throw H.alternate === null ? Error(i(467)) : Error(i(310));
			U = e, e = {
				memoizedState: U.memoizedState,
				baseState: U.baseState,
				baseQueue: U.baseQueue,
				queue: U.queue,
				next: null
			}, fo === null ? H.memoizedState = fo = e : fo = fo.next = e;
		}
		return fo;
	}
	function jo() {
		return {
			lastEffect: null,
			events: null,
			stores: null,
			memoCache: null
		};
	}
	function Mo(e) {
		var t = _o;
		return _o += 1, vo === null && (vo = []), e = Ta(vo, e, t), t = H, (fo === null ? t.memoizedState : fo.next) === null && (t = t.alternate, k.H = t === null || t.memoizedState === null ? zs : Bs), e;
	}
	function No(e) {
		if (typeof e == "object" && e) {
			if (typeof e.then == "function") return Mo(e);
			if (e.$$typeof === C) return $i(e);
		}
		throw Error(i(438, String(e)));
	}
	function Po(e) {
		var t = null, n = H.updateQueue;
		if (n !== null && (t = n.memoCache), t == null) {
			var r = H.alternate;
			r !== null && (r = r.updateQueue, r !== null && (r = r.memoCache, r != null && (t = {
				data: r.data.map(function(e) {
					return e.slice();
				}),
				index: 0
			})));
		}
		if (t ??= {
			data: [],
			index: 0
		}, n === null && (n = jo(), H.updateQueue = n), n.memoCache = t, n = t.data[t.index], n === void 0) for (n = t.data[t.index] = Array(e), r = 0; r < e; r++) n[r] = ne;
		return t.index++, n;
	}
	function Fo(e, t) {
		return typeof t == "function" ? t(e) : t;
	}
	function Io(e) {
		return Lo(Ao(), U, e);
	}
	function Lo(e, t, n) {
		var r = e.queue;
		if (r === null) throw Error(i(311));
		r.lastRenderedReducer = n;
		var a = e.baseQueue, o = r.pending;
		if (o !== null) {
			if (a !== null) {
				var s = a.next;
				a.next = o.next, o.next = s;
			}
			t.baseQueue = a = o, r.pending = null;
		}
		if (o = e.baseState, a === null) e.memoizedState = o;
		else {
			t = a.next;
			var c = s = null, l = null, u = t, d = !1;
			do {
				var f = u.lane & -536870913;
				if (f === u.lane ? (uo & f) === f : (Y & f) === f) {
					var p = u.revertLane;
					if (p === 0) l !== null && (l = l.next = {
						lane: 0,
						revertLane: 0,
						gesture: null,
						action: u.action,
						hasEagerState: u.hasEagerState,
						eagerState: u.eagerState,
						next: null
					}), f === ua && (d = !0);
					else if ((uo & p) === p) {
						u = u.next, p === ua && (d = !0);
						continue;
					} else f = {
						lane: 0,
						revertLane: u.revertLane,
						gesture: null,
						action: u.action,
						hasEagerState: u.hasEagerState,
						eagerState: u.eagerState,
						next: null
					}, l === null ? (c = l = f, s = o) : l = l.next = f, H.lanes |= p, Gl |= p;
					f = u.action, ho && n(o, f), o = u.hasEagerState ? u.eagerState : n(o, f);
				} else p = {
					lane: f,
					revertLane: u.revertLane,
					gesture: u.gesture,
					action: u.action,
					hasEagerState: u.hasEagerState,
					eagerState: u.eagerState,
					next: null
				}, l === null ? (c = l = p, s = o) : l = l.next = p, H.lanes |= f, Gl |= f;
				u = u.next;
			} while (u !== null && u !== t);
			if (l === null ? s = o : l.next = c, !Sr(o, e.memoizedState) && (rc = !0, d && (n = da, n !== null))) throw n;
			e.memoizedState = o, e.baseState = s, e.baseQueue = l, r.lastRenderedState = o;
		}
		return a === null && (r.lanes = 0), [e.memoizedState, r.dispatch];
	}
	function Ro(e) {
		var t = Ao(), n = t.queue;
		if (n === null) throw Error(i(311));
		n.lastRenderedReducer = e;
		var r = n.dispatch, a = n.pending, o = t.memoizedState;
		if (a !== null) {
			n.pending = null;
			var s = a = a.next;
			do
				o = e(o, s.action), s = s.next;
			while (s !== a);
			Sr(o, t.memoizedState) || (rc = !0), t.memoizedState = o, t.baseQueue === null && (t.baseState = o), n.lastRenderedState = o;
		}
		return [o, r];
	}
	function zo(e, t, n) {
		var r = H, a = Ao(), o = V;
		if (o) {
			if (n === void 0) throw Error(i(407));
			n = n();
		} else n = t();
		var s = !Sr((U || a).memoizedState, n);
		if (s && (a.memoizedState = n, rc = !0), a = a.queue, us(Ho.bind(null, r, a, e), [e]), a.getSnapshot !== t || s || fo !== null && fo.memoizedState.tag & 1) {
			if (r.flags |= 2048, as(9, { destroy: void 0 }, Vo.bind(null, r, a, n, t), null), q === null) throw Error(i(349));
			o || uo & 127 || Bo(r, t, n);
		}
		return n;
	}
	function Bo(e, t, n) {
		e.flags |= 16384, e = {
			getSnapshot: t,
			value: n
		}, t = H.updateQueue, t === null ? (t = jo(), H.updateQueue = t, t.stores = [e]) : (n = t.stores, n === null ? t.stores = [e] : n.push(e));
	}
	function Vo(e, t, n, r) {
		t.value = n, t.getSnapshot = r, Uo(t) && Wo(e);
	}
	function Ho(e, t, n) {
		return n(function() {
			Uo(t) && Wo(e);
		});
	}
	function Uo(e) {
		var t = e.getSnapshot;
		e = e.value;
		try {
			var n = t();
			return !Sr(e, n);
		} catch {
			return !0;
		}
	}
	function Wo(e) {
		var t = ri(e, 2);
		t !== null && hu(t, e, 2);
	}
	function Go(e) {
		var t = ko();
		if (typeof e == "function") {
			var n = e;
			if (e = n(), ho) {
				Be(!0);
				try {
					n();
				} finally {
					Be(!1);
				}
			}
		}
		return t.memoizedState = t.baseState = e, t.queue = {
			pending: null,
			lanes: 0,
			dispatch: null,
			lastRenderedReducer: Fo,
			lastRenderedState: e
		}, t;
	}
	function Ko(e, t, n, r) {
		return e.baseState = n, Lo(e, U, typeof r == "function" ? r : Fo);
	}
	function qo(e, t, n, r, a) {
		if (Fs(e)) throw Error(i(485));
		if (e = t.action, e !== null) {
			var o = {
				payload: a,
				action: e,
				next: null,
				isTransition: !0,
				status: "pending",
				value: null,
				reason: null,
				listeners: [],
				then: function(e) {
					o.listeners.push(e);
				}
			};
			k.T === null ? o.isTransition = !1 : n(!0), r(o), n = t.pending, n === null ? (o.next = t.pending = o, Jo(t, o)) : (o.next = n.next, t.pending = n.next = o);
		}
	}
	function Jo(e, t) {
		var n = t.action, r = t.payload, i = e.state;
		if (t.isTransition) {
			var a = k.T, o = {};
			k.T = o;
			try {
				var s = n(i, r), c = k.S;
				c !== null && c(o, s), Yo(e, t, s);
			} catch (n) {
				Zo(e, t, n);
			} finally {
				a !== null && o.types !== null && (a.types = o.types), k.T = a;
			}
		} else try {
			a = n(i, r), Yo(e, t, a);
		} catch (n) {
			Zo(e, t, n);
		}
	}
	function Yo(e, t, n) {
		typeof n == "object" && n && typeof n.then == "function" ? n.then(function(n) {
			Xo(e, t, n);
		}, function(n) {
			return Zo(e, t, n);
		}) : Xo(e, t, n);
	}
	function Xo(e, t, n) {
		t.status = "fulfilled", t.value = n, Qo(t), e.state = n, t = e.pending, t !== null && (n = t.next, n === t ? e.pending = null : (n = n.next, t.next = n, Jo(e, n)));
	}
	function Zo(e, t, n) {
		var r = e.pending;
		if (e.pending = null, r !== null) {
			r = r.next;
			do
				t.status = "rejected", t.reason = n, Qo(t), t = t.next;
			while (t !== r);
		}
		e.action = null;
	}
	function Qo(e) {
		e = e.listeners;
		for (var t = 0; t < e.length; t++) (0, e[t])();
	}
	function $o(e, t) {
		return t;
	}
	function es(e, t) {
		if (V) {
			var n = q.formState;
			if (n !== null) {
				a: {
					var r = H;
					if (V) {
						if (B) {
							b: {
								for (var i = B, a = Pi; i.nodeType !== 8;) {
									if (!a) {
										i = null;
										break b;
									}
									if (i = cf(i.nextSibling), i === null) {
										i = null;
										break b;
									}
								}
								a = i.data, i = a === "F!" || a === "F" ? i : null;
							}
							if (i) {
								B = cf(i.nextSibling), r = i.data === "F!";
								break a;
							}
						}
						Ii(r);
					}
					r = !1;
				}
				r && (t = n[0]);
			}
		}
		return n = ko(), n.memoizedState = n.baseState = t, r = {
			pending: null,
			lanes: 0,
			dispatch: null,
			lastRenderedReducer: $o,
			lastRenderedState: t
		}, n.queue = r, n = Ms.bind(null, H, r), r.dispatch = n, r = Go(!1), a = Ps.bind(null, H, !1, r.queue), r = ko(), i = {
			state: t,
			dispatch: null,
			action: e,
			pending: null
		}, r.queue = i, n = qo.bind(null, H, i, a, n), i.dispatch = n, r.memoizedState = e, [
			t,
			n,
			!1
		];
	}
	function ts(e) {
		return ns(Ao(), U, e);
	}
	function ns(e, t, n) {
		if (t = Lo(e, t, $o)[0], e = Io(Fo)[0], typeof t == "object" && t && typeof t.then == "function") try {
			var r = Mo(t);
		} catch (e) {
			throw e === ba ? Sa : e;
		}
		else r = t;
		t = Ao();
		var i = t.queue, a = i.dispatch;
		return n !== t.memoizedState && (H.flags |= 2048, as(9, { destroy: void 0 }, rs.bind(null, i, n), null)), [
			r,
			a,
			e
		];
	}
	function rs(e, t) {
		e.action = t;
	}
	function is(e) {
		var t = Ao(), n = U;
		if (n !== null) return ns(t, n, e);
		Ao(), t = t.memoizedState, n = Ao();
		var r = n.queue.dispatch;
		return n.memoizedState = e, [
			t,
			r,
			!1
		];
	}
	function as(e, t, n, r) {
		return e = {
			tag: e,
			create: n,
			deps: r,
			inst: t,
			next: null
		}, t = H.updateQueue, t === null && (t = jo(), H.updateQueue = t), n = t.lastEffect, n === null ? t.lastEffect = e.next = e : (r = n.next, n.next = e, e.next = r, t.lastEffect = e), e;
	}
	function os() {
		return Ao().memoizedState;
	}
	function ss(e, t, n, r) {
		var i = ko();
		H.flags |= e, i.memoizedState = as(1 | t, { destroy: void 0 }, n, r === void 0 ? null : r);
	}
	function cs(e, t, n, r) {
		var i = Ao();
		r = r === void 0 ? null : r;
		var a = i.memoizedState.inst;
		U !== null && r !== null && xo(r, U.memoizedState.deps) ? i.memoizedState = as(t, a, n, r) : (H.flags |= e, i.memoizedState = as(1 | t, a, n, r));
	}
	function ls(e, t) {
		ss(8390656, 8, e, t);
	}
	function us(e, t) {
		cs(2048, 8, e, t);
	}
	function ds(e) {
		H.flags |= 4;
		var t = H.updateQueue;
		if (t === null) t = jo(), H.updateQueue = t, t.events = [e];
		else {
			var n = t.events;
			n === null ? t.events = [e] : n.push(e);
		}
	}
	function fs(e) {
		var t = Ao().memoizedState;
		return ds({
			ref: t,
			nextImpl: e
		}), function() {
			if (K & 2) throw Error(i(440));
			return t.impl.apply(void 0, arguments);
		};
	}
	function ps(e, t) {
		return cs(4, 2, e, t);
	}
	function ms(e, t) {
		return cs(4, 4, e, t);
	}
	function hs(e, t) {
		if (typeof t == "function") {
			e = e();
			var n = t(e);
			return function() {
				typeof n == "function" ? n() : t(null);
			};
		}
		if (t != null) return e = e(), t.current = e, function() {
			t.current = null;
		};
	}
	function gs(e, t, n) {
		n = n == null ? null : n.concat([e]), cs(4, 4, hs.bind(null, t, e), n);
	}
	function _s() {}
	function vs(e, t) {
		var n = Ao();
		t = t === void 0 ? null : t;
		var r = n.memoizedState;
		return t !== null && xo(t, r[1]) ? r[0] : (n.memoizedState = [e, t], e);
	}
	function ys(e, t) {
		var n = Ao();
		t = t === void 0 ? null : t;
		var r = n.memoizedState;
		if (t !== null && xo(t, r[1])) return r[0];
		if (r = e(), ho) {
			Be(!0);
			try {
				e();
			} finally {
				Be(!1);
			}
		}
		return n.memoizedState = [r, t], r;
	}
	function bs(e, t, n) {
		return n === void 0 || uo & 1073741824 && !(Y & 261930) ? e.memoizedState = t : (e.memoizedState = n, e = mu(), H.lanes |= e, Gl |= e, n);
	}
	function xs(e, t, n, r) {
		return Sr(n, t) ? n : Xa.current === null ? !(uo & 42) || uo & 1073741824 && !(Y & 261930) ? (rc = !0, e.memoizedState = n) : (e = mu(), H.lanes |= e, Gl |= e, t) : (e = bs(e, n, r), Sr(e, t) || (rc = !0), e);
	}
	function Ss(e, t, n, r, i) {
		var a = A.p;
		A.p = a !== 0 && 8 > a ? a : 8;
		var o = k.T, s = {};
		k.T = s, Ps(e, !1, t, n);
		try {
			var c = i(), l = k.S;
			l !== null && l(s, c), typeof c == "object" && c && typeof c.then == "function" ? Ns(e, t, ma(c, r), pu(e)) : Ns(e, t, r, pu(e));
		} catch (n) {
			Ns(e, t, {
				then: function() {},
				status: "rejected",
				reason: n
			}, pu());
		} finally {
			A.p = a, o !== null && s.types !== null && (o.types = s.types), k.T = o;
		}
	}
	function Cs() {}
	function ws(e, t, n, r) {
		if (e.tag !== 5) throw Error(i(476));
		var a = Ts(e).queue;
		Ss(e, a, t, se, n === null ? Cs : function() {
			return Es(e), n(r);
		});
	}
	function Ts(e) {
		var t = e.memoizedState;
		if (t !== null) return t;
		t = {
			memoizedState: se,
			baseState: se,
			baseQueue: null,
			queue: {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Fo,
				lastRenderedState: se
			},
			next: null
		};
		var n = {};
		return t.next = {
			memoizedState: n,
			baseState: n,
			baseQueue: null,
			queue: {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Fo,
				lastRenderedState: n
			},
			next: null
		}, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
	}
	function Es(e) {
		var t = Ts(e);
		t.next === null && (t = e.alternate.memoizedState), Ns(e, t.next.queue, {}, pu());
	}
	function Ds() {
		return $i(Qf);
	}
	function Os() {
		return Ao().memoizedState;
	}
	function ks() {
		return Ao().memoizedState;
	}
	function As(e) {
		for (var t = e.return; t !== null;) {
			switch (t.tag) {
				case 24:
				case 3:
					var n = pu();
					e = Va(n);
					var r = Ha(t, e, n);
					r !== null && (hu(r, t, n), Ua(r, t, n)), t = { cache: oa() }, e.payload = t;
					return;
			}
			t = t.return;
		}
	}
	function js(e, t, n) {
		var r = pu();
		n = {
			lane: r,
			revertLane: 0,
			gesture: null,
			action: n,
			hasEagerState: !1,
			eagerState: null,
			next: null
		}, Fs(e) ? Is(t, n) : (n = ni(e, t, n, r), n !== null && (hu(n, e, r), Ls(n, t, r)));
	}
	function Ms(e, t, n) {
		Ns(e, t, n, pu());
	}
	function Ns(e, t, n, r) {
		var i = {
			lane: r,
			revertLane: 0,
			gesture: null,
			action: n,
			hasEagerState: !1,
			eagerState: null,
			next: null
		};
		if (Fs(e)) Is(t, i);
		else {
			var a = e.alternate;
			if (e.lanes === 0 && (a === null || a.lanes === 0) && (a = t.lastRenderedReducer, a !== null)) try {
				var o = t.lastRenderedState, s = a(o, n);
				if (i.hasEagerState = !0, i.eagerState = s, Sr(s, o)) return ti(e, t, i, 0), q === null && ei(), !1;
			} catch {}
			if (n = ni(e, t, i, r), n !== null) return hu(n, e, r), Ls(n, t, r), !0;
		}
		return !1;
	}
	function Ps(e, t, n, r) {
		if (r = {
			lane: 2,
			revertLane: dd(),
			gesture: null,
			action: r,
			hasEagerState: !1,
			eagerState: null,
			next: null
		}, Fs(e)) {
			if (t) throw Error(i(479));
		} else t = ni(e, n, r, 2), t !== null && hu(t, e, 2);
	}
	function Fs(e) {
		var t = e.alternate;
		return e === H || t !== null && t === H;
	}
	function Is(e, t) {
		mo = po = !0;
		var n = e.pending;
		n === null ? t.next = t : (t.next = n.next, n.next = t), e.pending = t;
	}
	function Ls(e, t, n) {
		if (n & 4194048) {
			var r = t.lanes;
			r &= e.pendingLanes, n |= r, t.lanes = n, nt(e, n);
		}
	}
	var Rs = {
		readContext: $i,
		use: No,
		useCallback: bo,
		useContext: bo,
		useEffect: bo,
		useImperativeHandle: bo,
		useLayoutEffect: bo,
		useInsertionEffect: bo,
		useMemo: bo,
		useReducer: bo,
		useRef: bo,
		useState: bo,
		useDebugValue: bo,
		useDeferredValue: bo,
		useTransition: bo,
		useSyncExternalStore: bo,
		useId: bo,
		useHostTransitionStatus: bo,
		useFormState: bo,
		useActionState: bo,
		useOptimistic: bo,
		useMemoCache: bo,
		useCacheRefresh: bo
	};
	Rs.useEffectEvent = bo;
	var zs = {
		readContext: $i,
		use: No,
		useCallback: function(e, t) {
			return ko().memoizedState = [e, t === void 0 ? null : t], e;
		},
		useContext: $i,
		useEffect: ls,
		useImperativeHandle: function(e, t, n) {
			n = n == null ? null : n.concat([e]), ss(4194308, 4, hs.bind(null, t, e), n);
		},
		useLayoutEffect: function(e, t) {
			return ss(4194308, 4, e, t);
		},
		useInsertionEffect: function(e, t) {
			ss(4, 2, e, t);
		},
		useMemo: function(e, t) {
			var n = ko();
			t = t === void 0 ? null : t;
			var r = e();
			if (ho) {
				Be(!0);
				try {
					e();
				} finally {
					Be(!1);
				}
			}
			return n.memoizedState = [r, t], r;
		},
		useReducer: function(e, t, n) {
			var r = ko();
			if (n !== void 0) {
				var i = n(t);
				if (ho) {
					Be(!0);
					try {
						n(t);
					} finally {
						Be(!1);
					}
				}
			} else i = t;
			return r.memoizedState = r.baseState = i, e = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: e,
				lastRenderedState: i
			}, r.queue = e, e = e.dispatch = js.bind(null, H, e), [r.memoizedState, e];
		},
		useRef: function(e) {
			var t = ko();
			return e = { current: e }, t.memoizedState = e;
		},
		useState: function(e) {
			e = Go(e);
			var t = e.queue, n = Ms.bind(null, H, t);
			return t.dispatch = n, [e.memoizedState, n];
		},
		useDebugValue: _s,
		useDeferredValue: function(e, t) {
			return bs(ko(), e, t);
		},
		useTransition: function() {
			var e = Go(!1);
			return e = Ss.bind(null, H, e.queue, !0, !1), ko().memoizedState = e, [!1, e];
		},
		useSyncExternalStore: function(e, t, n) {
			var r = H, a = ko();
			if (V) {
				if (n === void 0) throw Error(i(407));
				n = n();
			} else {
				if (n = t(), q === null) throw Error(i(349));
				Y & 127 || Bo(r, t, n);
			}
			a.memoizedState = n;
			var o = {
				value: n,
				getSnapshot: t
			};
			return a.queue = o, ls(Ho.bind(null, r, o, e), [e]), r.flags |= 2048, as(9, { destroy: void 0 }, Vo.bind(null, r, o, n, t), null), n;
		},
		useId: function() {
			var e = ko(), t = q.identifierPrefix;
			if (V) {
				var n = Ei, r = Ti;
				n = (r & ~(1 << 32 - Ve(r) - 1)).toString(32) + n, t = "_" + t + "R_" + n, n = go++, 0 < n && (t += "H" + n.toString(32)), t += "_";
			} else n = yo++, t = "_" + t + "r_" + n.toString(32) + "_";
			return e.memoizedState = t;
		},
		useHostTransitionStatus: Ds,
		useFormState: es,
		useActionState: es,
		useOptimistic: function(e) {
			var t = ko();
			t.memoizedState = t.baseState = e;
			var n = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: null,
				lastRenderedState: null
			};
			return t.queue = n, t = Ps.bind(null, H, !0, n), n.dispatch = t, [e, t];
		},
		useMemoCache: Po,
		useCacheRefresh: function() {
			return ko().memoizedState = As.bind(null, H);
		},
		useEffectEvent: function(e) {
			var t = ko(), n = { impl: e };
			return t.memoizedState = n, function() {
				if (K & 2) throw Error(i(440));
				return n.impl.apply(void 0, arguments);
			};
		}
	}, Bs = {
		readContext: $i,
		use: No,
		useCallback: vs,
		useContext: $i,
		useEffect: us,
		useImperativeHandle: gs,
		useInsertionEffect: ps,
		useLayoutEffect: ms,
		useMemo: ys,
		useReducer: Io,
		useRef: os,
		useState: function() {
			return Io(Fo);
		},
		useDebugValue: _s,
		useDeferredValue: function(e, t) {
			return xs(Ao(), U.memoizedState, e, t);
		},
		useTransition: function() {
			var e = Io(Fo)[0], t = Ao().memoizedState;
			return [typeof e == "boolean" ? e : Mo(e), t];
		},
		useSyncExternalStore: zo,
		useId: Os,
		useHostTransitionStatus: Ds,
		useFormState: ts,
		useActionState: ts,
		useOptimistic: function(e, t) {
			return Ko(Ao(), U, e, t);
		},
		useMemoCache: Po,
		useCacheRefresh: ks
	};
	Bs.useEffectEvent = fs;
	var Vs = {
		readContext: $i,
		use: No,
		useCallback: vs,
		useContext: $i,
		useEffect: us,
		useImperativeHandle: gs,
		useInsertionEffect: ps,
		useLayoutEffect: ms,
		useMemo: ys,
		useReducer: Ro,
		useRef: os,
		useState: function() {
			return Ro(Fo);
		},
		useDebugValue: _s,
		useDeferredValue: function(e, t) {
			var n = Ao();
			return U === null ? bs(n, e, t) : xs(n, U.memoizedState, e, t);
		},
		useTransition: function() {
			var e = Ro(Fo)[0], t = Ao().memoizedState;
			return [typeof e == "boolean" ? e : Mo(e), t];
		},
		useSyncExternalStore: zo,
		useId: Os,
		useHostTransitionStatus: Ds,
		useFormState: is,
		useActionState: is,
		useOptimistic: function(e, t) {
			var n = Ao();
			return U === null ? (n.baseState = e, [e, n.queue.dispatch]) : Ko(n, U, e, t);
		},
		useMemoCache: Po,
		useCacheRefresh: ks
	};
	Vs.useEffectEvent = fs;
	function Hs(e, t, n, r) {
		t = e.memoizedState, n = n(r, t), n = n == null ? t : h({}, t, n), e.memoizedState = n, e.lanes === 0 && (e.updateQueue.baseState = n);
	}
	var Us = {
		enqueueSetState: function(e, t, n) {
			e = e._reactInternals;
			var r = pu(), i = Va(r);
			i.payload = t, n != null && (i.callback = n), t = Ha(e, i, r), t !== null && (hu(t, e, r), Ua(t, e, r));
		},
		enqueueReplaceState: function(e, t, n) {
			e = e._reactInternals;
			var r = pu(), i = Va(r);
			i.tag = 1, i.payload = t, n != null && (i.callback = n), t = Ha(e, i, r), t !== null && (hu(t, e, r), Ua(t, e, r));
		},
		enqueueForceUpdate: function(e, t) {
			e = e._reactInternals;
			var n = pu(), r = Va(n);
			r.tag = 2, t != null && (r.callback = t), t = Ha(e, r, n), t !== null && (hu(t, e, n), Ua(t, e, n));
		}
	};
	function Ws(e, t, n, r, i, a, o) {
		return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(r, a, o) : t.prototype && t.prototype.isPureReactComponent ? !Cr(n, r) || !Cr(i, a) : !0;
	}
	function Gs(e, t, n, r) {
		e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(n, r), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(n, r), t.state !== e && Us.enqueueReplaceState(t, t.state, null);
	}
	function Ks(e, t) {
		var n = t;
		if ("ref" in t) for (var r in n = {}, t) r !== "ref" && (n[r] = t[r]);
		if (e = e.defaultProps) for (var i in n === t && (n = h({}, n)), e) n[i] === void 0 && (n[i] = e[i]);
		return n;
	}
	function qs(e) {
		Xr(e);
	}
	function Js(e) {
		console.error(e);
	}
	function Ys(e) {
		Xr(e);
	}
	function Xs(e, t) {
		try {
			var n = e.onUncaughtError;
			n(t.value, { componentStack: t.stack });
		} catch (e) {
			setTimeout(function() {
				throw e;
			});
		}
	}
	function Zs(e, t, n) {
		try {
			var r = e.onCaughtError;
			r(n.value, {
				componentStack: n.stack,
				errorBoundary: t.tag === 1 ? t.stateNode : null
			});
		} catch (e) {
			setTimeout(function() {
				throw e;
			});
		}
	}
	function Qs(e, t, n) {
		return n = Va(n), n.tag = 3, n.payload = { element: null }, n.callback = function() {
			Xs(e, t);
		}, n;
	}
	function $s(e) {
		return e = Va(e), e.tag = 3, e;
	}
	function ec(e, t, n, r) {
		var i = n.type.getDerivedStateFromError;
		if (typeof i == "function") {
			var a = r.value;
			e.payload = function() {
				return i(a);
			}, e.callback = function() {
				Zs(t, n, r);
			};
		}
		var o = n.stateNode;
		o !== null && typeof o.componentDidCatch == "function" && (e.callback = function() {
			Zs(t, n, r), typeof i != "function" && (ru === null ? ru = new Set([this]) : ru.add(this));
			var e = r.stack;
			this.componentDidCatch(r.value, { componentStack: e === null ? "" : e });
		});
	}
	function tc(e, t, n, r, a) {
		if (n.flags |= 32768, typeof r == "object" && r && typeof r.then == "function") {
			if (t = n.alternate, t !== null && Xi(t, n, a, !0), n = to.current, n !== null) {
				switch (n.tag) {
					case 31:
					case 13: return no === null ? Du() : n.alternate === null && Wl === 0 && (Wl = 3), n.flags &= -257, n.flags |= 65536, n.lanes = a, r === Ca ? n.flags |= 16384 : (t = n.updateQueue, t === null ? n.updateQueue = new Set([r]) : t.add(r), Gu(e, r, a)), !1;
					case 22: return n.flags |= 65536, r === Ca ? n.flags |= 16384 : (t = n.updateQueue, t === null ? (t = {
						transitions: null,
						markerInstances: null,
						retryQueue: new Set([r])
					}, n.updateQueue = t) : (n = t.retryQueue, n === null ? t.retryQueue = new Set([r]) : n.add(r)), Gu(e, r, a)), !1;
				}
				throw Error(i(435, n.tag));
			}
			return Gu(e, r, a), Du(), !1;
		}
		if (V) return t = to.current, t === null ? (r !== Fi && (t = Error(i(423), { cause: r }), Hi(_i(t, n))), e = e.current.alternate, e.flags |= 65536, a &= -a, e.lanes |= a, r = _i(r, n), a = Qs(e.stateNode, r, a), Wa(e, a), Wl !== 4 && (Wl = 2)) : (!(t.flags & 65536) && (t.flags |= 256), t.flags |= 65536, t.lanes = a, r !== Fi && (e = Error(i(422), { cause: r }), Hi(_i(e, n)))), !1;
		var o = Error(i(520), { cause: r });
		if (o = _i(o, n), Xl === null ? Xl = [o] : Xl.push(o), Wl !== 4 && (Wl = 2), t === null) return !0;
		r = _i(r, n), n = t;
		do {
			switch (n.tag) {
				case 3: return n.flags |= 65536, e = a & -a, n.lanes |= e, e = Qs(n.stateNode, r, e), Wa(n, e), !1;
				case 1: if (t = n.type, o = n.stateNode, !(n.flags & 128) && (typeof t.getDerivedStateFromError == "function" || o !== null && typeof o.componentDidCatch == "function" && (ru === null || !ru.has(o)))) return n.flags |= 65536, a &= -a, n.lanes |= a, a = $s(a), ec(a, e, n, r), Wa(n, a), !1;
			}
			n = n.return;
		} while (n !== null);
		return !1;
	}
	var nc = Error(i(461)), rc = !1;
	function ic(e, t, n, r) {
		t.child = e === null ? La(t, null, n, r) : Ia(t, e.child, n, r);
	}
	function ac(e, t, n, r, i) {
		n = n.render;
		var a = t.ref;
		if ("ref" in r) {
			var o = {};
			for (var s in r) s !== "ref" && (o[s] = r[s]);
		} else o = r;
		return Qi(t), r = So(e, t, n, o, a, i), s = Eo(), e !== null && !rc ? (Do(e, t, i), kc(e, t, i)) : (V && s && ki(t), t.flags |= 1, ic(e, t, r, i), t.child);
	}
	function oc(e, t, n, r, i) {
		if (e === null) {
			var a = n.type;
			return typeof a == "function" && !ci(a) && a.defaultProps === void 0 && n.compare === null ? (t.tag = 15, t.type = a, sc(e, t, a, r, i)) : (e = di(n.type, null, r, t, t.mode, i), e.ref = t.ref, e.return = t, t.child = e);
		}
		if (a = e.child, !Ac(e, i)) {
			var o = a.memoizedProps;
			if (n = n.compare, n = n === null ? Cr : n, n(o, r) && e.ref === t.ref) return kc(e, t, i);
		}
		return t.flags |= 1, e = li(a, r), e.ref = t.ref, e.return = t, t.child = e;
	}
	function sc(e, t, n, r, i) {
		if (e !== null) {
			var a = e.memoizedProps;
			if (Cr(a, r) && e.ref === t.ref) if (rc = !1, t.pendingProps = r = a, Ac(e, i)) e.flags & 131072 && (rc = !0);
			else return t.lanes = e.lanes, kc(e, t, i);
		}
		return hc(e, t, n, r, i);
	}
	function cc(e, t, n, r) {
		var i = r.children, a = e === null ? null : e.memoizedState;
		if (e === null && t.stateNode === null && (t.stateNode = {
			_visibility: 1,
			_pendingMarkers: null,
			_retryCache: null,
			_transitions: null
		}), r.mode === "hidden") {
			if (t.flags & 128) {
				if (a = a === null ? n : a.baseLanes | n, e !== null) {
					for (r = t.child = e.child, i = 0; r !== null;) i = i | r.lanes | r.childLanes, r = r.sibling;
					r = i & ~a;
				} else r = 0, t.child = null;
				return uc(e, t, a, n, r);
			}
			if (n & 536870912) t.memoizedState = {
				baseLanes: 0,
				cachePool: null
			}, e !== null && va(t, a === null ? null : a.cachePool), a === null ? $a() : Qa(t, a), ao(t);
			else return r = t.lanes = 536870912, uc(e, t, a === null ? n : a.baseLanes | n, n, r);
		} else a === null ? (e !== null && va(t, null), $a(), oo(t)) : (va(t, a.cachePool), Qa(t, a), oo(t), t.memoizedState = null);
		return ic(e, t, i, n), t.child;
	}
	function lc(e, t) {
		return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = {
			_visibility: 1,
			_pendingMarkers: null,
			_retryCache: null,
			_transitions: null
		}), t.sibling;
	}
	function uc(e, t, n, r, i) {
		var a = _a();
		return a = a === null ? null : {
			parent: aa._currentValue,
			pool: a
		}, t.memoizedState = {
			baseLanes: n,
			cachePool: a
		}, e !== null && va(t, null), $a(), ao(t), e !== null && Xi(e, t, r, !0), t.childLanes = i, null;
	}
	function dc(e, t) {
		return t = wc({
			mode: t.mode,
			children: t.children
		}, e.mode), t.ref = e.ref, e.child = t, t.return = e, t;
	}
	function fc(e, t, n) {
		return Ia(t, e.child, null, n), e = dc(t, t.pendingProps), e.flags |= 2, so(t), t.memoizedState = null, e;
	}
	function pc(e, t, n) {
		var r = t.pendingProps, a = (t.flags & 128) != 0;
		if (t.flags &= -129, e === null) {
			if (V) {
				if (r.mode === "hidden") return e = dc(t, r), t.lanes = 536870912, lc(null, e);
				if (io(t), (e = B) ? (e = rf(e, Pi), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = {
					dehydrated: e,
					treeContext: wi === null ? null : {
						id: Ti,
						overflow: Ei
					},
					retryLane: 536870912,
					hydrationErrors: null
				}, n = mi(e), n.return = t, t.child = n, Mi = t, B = null)) : e = null, e === null) throw Ii(t);
				return t.lanes = 536870912, null;
			}
			return dc(t, r);
		}
		var o = e.memoizedState;
		if (o !== null) {
			var s = o.dehydrated;
			if (io(t), a) if (t.flags & 256) t.flags &= -257, t = fc(e, t, n);
			else if (t.memoizedState !== null) t.child = e.child, t.flags |= 128, t = null;
			else throw Error(i(558));
			else if (rc || Xi(e, t, n, !1), a = (n & e.childLanes) !== 0, rc || a) {
				if (r = q, r !== null && (s = rt(r, n), s !== 0 && s !== o.retryLane)) throw o.retryLane = s, ri(e, s), hu(r, e, s), nc;
				Du(), t = fc(e, t, n);
			} else e = o.treeContext, B = cf(s.nextSibling), Mi = t, V = !0, Ni = null, Pi = !1, e !== null && ji(t, e), t = dc(t, r), t.flags |= 4096;
			return t;
		}
		return e = li(e.child, {
			mode: r.mode,
			children: r.children
		}), e.ref = t.ref, t.child = e, e.return = t, e;
	}
	function mc(e, t) {
		var n = t.ref;
		if (n === null) e !== null && e.ref !== null && (t.flags |= 4194816);
		else {
			if (typeof n != "function" && typeof n != "object") throw Error(i(284));
			(e === null || e.ref !== n) && (t.flags |= 4194816);
		}
	}
	function hc(e, t, n, r, i) {
		return Qi(t), n = So(e, t, n, r, void 0, i), r = Eo(), e !== null && !rc ? (Do(e, t, i), kc(e, t, i)) : (V && r && ki(t), t.flags |= 1, ic(e, t, n, i), t.child);
	}
	function gc(e, t, n, r, i, a) {
		return Qi(t), t.updateQueue = null, n = wo(t, r, n, i), Co(e), r = Eo(), e !== null && !rc ? (Do(e, t, a), kc(e, t, a)) : (V && r && ki(t), t.flags |= 1, ic(e, t, n, a), t.child);
	}
	function _c(e, t, n, r, i) {
		if (Qi(t), t.stateNode === null) {
			var a = oi, o = n.contextType;
			typeof o == "object" && o && (a = $i(o)), a = new n(r, a), t.memoizedState = a.state !== null && a.state !== void 0 ? a.state : null, a.updater = Us, t.stateNode = a, a._reactInternals = t, a = t.stateNode, a.props = r, a.state = t.memoizedState, a.refs = {}, za(t), o = n.contextType, a.context = typeof o == "object" && o ? $i(o) : oi, a.state = t.memoizedState, o = n.getDerivedStateFromProps, typeof o == "function" && (Hs(t, n, o, r), a.state = t.memoizedState), typeof n.getDerivedStateFromProps == "function" || typeof a.getSnapshotBeforeUpdate == "function" || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (o = a.state, typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount(), o !== a.state && Us.enqueueReplaceState(a, a.state, null), qa(t, r, a, i), Ka(), a.state = t.memoizedState), typeof a.componentDidMount == "function" && (t.flags |= 4194308), r = !0;
		} else if (e === null) {
			a = t.stateNode;
			var s = t.memoizedProps, c = Ks(n, s);
			a.props = c;
			var l = a.context, u = n.contextType;
			o = oi, typeof u == "object" && u && (o = $i(u));
			var d = n.getDerivedStateFromProps;
			u = typeof d == "function" || typeof a.getSnapshotBeforeUpdate == "function", s = t.pendingProps !== s, u || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (s || l !== o) && Gs(t, a, r, o), Ra = !1;
			var f = t.memoizedState;
			a.state = f, qa(t, r, a, i), Ka(), l = t.memoizedState, s || f !== l || Ra ? (typeof d == "function" && (Hs(t, n, d, r), l = t.memoizedState), (c = Ra || Ws(t, n, c, r, f, l, o)) ? (u || typeof a.UNSAFE_componentWillMount != "function" && typeof a.componentWillMount != "function" || (typeof a.componentWillMount == "function" && a.componentWillMount(), typeof a.UNSAFE_componentWillMount == "function" && a.UNSAFE_componentWillMount()), typeof a.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = r, t.memoizedState = l), a.props = r, a.state = l, a.context = o, r = c) : (typeof a.componentDidMount == "function" && (t.flags |= 4194308), r = !1);
		} else {
			a = t.stateNode, Ba(e, t), o = t.memoizedProps, u = Ks(n, o), a.props = u, d = t.pendingProps, f = a.context, l = n.contextType, c = oi, typeof l == "object" && l && (c = $i(l)), s = n.getDerivedStateFromProps, (l = typeof s == "function" || typeof a.getSnapshotBeforeUpdate == "function") || typeof a.UNSAFE_componentWillReceiveProps != "function" && typeof a.componentWillReceiveProps != "function" || (o !== d || f !== c) && Gs(t, a, r, c), Ra = !1, f = t.memoizedState, a.state = f, qa(t, r, a, i), Ka();
			var p = t.memoizedState;
			o !== d || f !== p || Ra || e !== null && e.dependencies !== null && Zi(e.dependencies) ? (typeof s == "function" && (Hs(t, n, s, r), p = t.memoizedState), (u = Ra || Ws(t, n, u, r, f, p, c) || e !== null && e.dependencies !== null && Zi(e.dependencies)) ? (l || typeof a.UNSAFE_componentWillUpdate != "function" && typeof a.componentWillUpdate != "function" || (typeof a.componentWillUpdate == "function" && a.componentWillUpdate(r, p, c), typeof a.UNSAFE_componentWillUpdate == "function" && a.UNSAFE_componentWillUpdate(r, p, c)), typeof a.componentDidUpdate == "function" && (t.flags |= 4), typeof a.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), t.memoizedProps = r, t.memoizedState = p), a.props = r, a.state = p, a.context = c, r = u) : (typeof a.componentDidUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 4), typeof a.getSnapshotBeforeUpdate != "function" || o === e.memoizedProps && f === e.memoizedState || (t.flags |= 1024), r = !1);
		}
		return a = r, mc(e, t), r = (t.flags & 128) != 0, a || r ? (a = t.stateNode, n = r && typeof n.getDerivedStateFromError != "function" ? null : a.render(), t.flags |= 1, e !== null && r ? (t.child = Ia(t, e.child, null, i), t.child = Ia(t, null, n, i)) : ic(e, t, n, i), t.memoizedState = a.state, e = t.child) : e = kc(e, t, i), e;
	}
	function vc(e, t, n, r) {
		return Bi(), t.flags |= 256, ic(e, t, n, r), t.child;
	}
	var yc = {
		dehydrated: null,
		treeContext: null,
		retryLane: 0,
		hydrationErrors: null
	};
	function bc(e) {
		return {
			baseLanes: e,
			cachePool: ya()
		};
	}
	function xc(e, t, n) {
		return e = e === null ? 0 : e.childLanes & ~n, t && (e |= Jl), e;
	}
	function Sc(e, t, n) {
		var r = t.pendingProps, a = !1, o = (t.flags & 128) != 0, s;
		if ((s = o) || (s = e !== null && e.memoizedState === null ? !1 : (co.current & 2) != 0), s && (a = !0, t.flags &= -129), s = (t.flags & 32) != 0, t.flags &= -33, e === null) {
			if (V) {
				if (a ? ro(t) : oo(t), (e = B) ? (e = rf(e, Pi), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = {
					dehydrated: e,
					treeContext: wi === null ? null : {
						id: Ti,
						overflow: Ei
					},
					retryLane: 536870912,
					hydrationErrors: null
				}, n = mi(e), n.return = t, t.child = n, Mi = t, B = null)) : e = null, e === null) throw Ii(t);
				return of(e) ? t.lanes = 32 : t.lanes = 536870912, null;
			}
			var c = r.children;
			return r = r.fallback, a ? (oo(t), a = t.mode, c = wc({
				mode: "hidden",
				children: c
			}, a), r = fi(r, a, n, null), c.return = t, r.return = t, c.sibling = r, t.child = c, r = t.child, r.memoizedState = bc(n), r.childLanes = xc(e, s, n), t.memoizedState = yc, lc(null, r)) : (ro(t), Cc(t, c));
		}
		var l = e.memoizedState;
		if (l !== null && (c = l.dehydrated, c !== null)) {
			if (o) t.flags & 256 ? (ro(t), t.flags &= -257, t = Tc(e, t, n)) : t.memoizedState === null ? (oo(t), c = r.fallback, a = t.mode, r = wc({
				mode: "visible",
				children: r.children
			}, a), c = fi(c, a, n, null), c.flags |= 2, r.return = t, c.return = t, r.sibling = c, t.child = r, Ia(t, e.child, null, n), r = t.child, r.memoizedState = bc(n), r.childLanes = xc(e, s, n), t.memoizedState = yc, t = lc(null, r)) : (oo(t), t.child = e.child, t.flags |= 128, t = null);
			else if (ro(t), of(c)) {
				if (s = c.nextSibling && c.nextSibling.dataset, s) var u = s.dgst;
				s = u, r = Error(i(419)), r.stack = "", r.digest = s, Hi({
					value: r,
					source: null,
					stack: null
				}), t = Tc(e, t, n);
			} else if (rc || Xi(e, t, n, !1), s = (n & e.childLanes) !== 0, rc || s) {
				if (s = q, s !== null && (r = rt(s, n), r !== 0 && r !== l.retryLane)) throw l.retryLane = r, ri(e, r), hu(s, e, r), nc;
				af(c) || Du(), t = Tc(e, t, n);
			} else af(c) ? (t.flags |= 192, t.child = e.child, t = null) : (e = l.treeContext, B = cf(c.nextSibling), Mi = t, V = !0, Ni = null, Pi = !1, e !== null && ji(t, e), t = Cc(t, r.children), t.flags |= 4096);
			return t;
		}
		return a ? (oo(t), c = r.fallback, a = t.mode, l = e.child, u = l.sibling, r = li(l, {
			mode: "hidden",
			children: r.children
		}), r.subtreeFlags = l.subtreeFlags & 65011712, u === null ? (c = fi(c, a, n, null), c.flags |= 2) : c = li(u, c), c.return = t, r.return = t, r.sibling = c, t.child = r, lc(null, r), r = t.child, c = e.child.memoizedState, c === null ? c = bc(n) : (a = c.cachePool, a === null ? a = ya() : (l = aa._currentValue, a = a.parent === l ? a : {
			parent: l,
			pool: l
		}), c = {
			baseLanes: c.baseLanes | n,
			cachePool: a
		}), r.memoizedState = c, r.childLanes = xc(e, s, n), t.memoizedState = yc, lc(e.child, r)) : (ro(t), n = e.child, e = n.sibling, n = li(n, {
			mode: "visible",
			children: r.children
		}), n.return = t, n.sibling = null, e !== null && (s = t.deletions, s === null ? (t.deletions = [e], t.flags |= 16) : s.push(e)), t.child = n, t.memoizedState = null, n);
	}
	function Cc(e, t) {
		return t = wc({
			mode: "visible",
			children: t
		}, e.mode), t.return = e, e.child = t;
	}
	function wc(e, t) {
		return e = z(22, e, null, t), e.lanes = 0, e;
	}
	function Tc(e, t, n) {
		return Ia(t, e.child, null, n), e = Cc(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
	}
	function Ec(e, t, n) {
		e.lanes |= t;
		var r = e.alternate;
		r !== null && (r.lanes |= t), Ji(e.return, t, n);
	}
	function Dc(e, t, n, r, i, a) {
		var o = e.memoizedState;
		o === null ? e.memoizedState = {
			isBackwards: t,
			rendering: null,
			renderingStartTime: 0,
			last: r,
			tail: n,
			tailMode: i,
			treeForkCount: a
		} : (o.isBackwards = t, o.rendering = null, o.renderingStartTime = 0, o.last = r, o.tail = n, o.tailMode = i, o.treeForkCount = a);
	}
	function Oc(e, t, n) {
		var r = t.pendingProps, i = r.revealOrder, a = r.tail;
		r = r.children;
		var o = co.current, s = (o & 2) != 0;
		if (s ? (o = o & 1 | 2, t.flags |= 128) : o &= 1, N(co, o), ic(e, t, r, n), r = V ? xi : 0, !s && e !== null && e.flags & 128) a: for (e = t.child; e !== null;) {
			if (e.tag === 13) e.memoizedState !== null && Ec(e, n, t);
			else if (e.tag === 19) Ec(e, n, t);
			else if (e.child !== null) {
				e.child.return = e, e = e.child;
				continue;
			}
			if (e === t) break a;
			for (; e.sibling === null;) {
				if (e.return === null || e.return === t) break a;
				e = e.return;
			}
			e.sibling.return = e.return, e = e.sibling;
		}
		switch (i) {
			case "forwards":
				for (n = t.child, i = null; n !== null;) e = n.alternate, e !== null && lo(e) === null && (i = n), n = n.sibling;
				n = i, n === null ? (i = t.child, t.child = null) : (i = n.sibling, n.sibling = null), Dc(t, !1, i, n, a, r);
				break;
			case "backwards":
			case "unstable_legacy-backwards":
				for (n = null, i = t.child, t.child = null; i !== null;) {
					if (e = i.alternate, e !== null && lo(e) === null) {
						t.child = i;
						break;
					}
					e = i.sibling, i.sibling = n, n = i, i = e;
				}
				Dc(t, !0, n, null, a, r);
				break;
			case "together":
				Dc(t, !1, null, null, void 0, r);
				break;
			default: t.memoizedState = null;
		}
		return t.child;
	}
	function kc(e, t, n) {
		if (e !== null && (t.dependencies = e.dependencies), Gl |= t.lanes, (n & t.childLanes) === 0) if (e !== null) {
			if (Xi(e, t, n, !1), (n & t.childLanes) === 0) return null;
		} else return null;
		if (e !== null && t.child !== e.child) throw Error(i(153));
		if (t.child !== null) {
			for (e = t.child, n = li(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null;) e = e.sibling, n = n.sibling = li(e, e.pendingProps), n.return = t;
			n.sibling = null;
		}
		return t.child;
	}
	function Ac(e, t) {
		return (e.lanes & t) === 0 ? (e = e.dependencies, !!(e !== null && Zi(e))) : !0;
	}
	function jc(e, t, n) {
		switch (t.tag) {
			case 3:
				pe(t, t.stateNode.containerInfo), Ki(t, aa, e.memoizedState.cache), Bi();
				break;
			case 27:
			case 5:
				he(t);
				break;
			case 4:
				pe(t, t.stateNode.containerInfo);
				break;
			case 10:
				Ki(t, t.type, t.memoizedProps.value);
				break;
			case 31:
				if (t.memoizedState !== null) return t.flags |= 128, io(t), null;
				break;
			case 13:
				var r = t.memoizedState;
				if (r !== null) return r.dehydrated === null ? (n & t.child.childLanes) === 0 ? (ro(t), e = kc(e, t, n), e === null ? null : e.sibling) : Sc(e, t, n) : (ro(t), t.flags |= 128, null);
				ro(t);
				break;
			case 19:
				var i = (e.flags & 128) != 0;
				if (r = (n & t.childLanes) !== 0, r ||= (Xi(e, t, n, !1), (n & t.childLanes) !== 0), i) {
					if (r) return Oc(e, t, n);
					t.flags |= 128;
				}
				if (i = t.memoizedState, i !== null && (i.rendering = null, i.tail = null, i.lastEffect = null), N(co, co.current), r) break;
				return null;
			case 22: return t.lanes = 0, cc(e, t, n, t.pendingProps);
			case 24: Ki(t, aa, e.memoizedState.cache);
		}
		return kc(e, t, n);
	}
	function Mc(e, t, n) {
		if (e !== null) if (e.memoizedProps !== t.pendingProps) rc = !0;
		else {
			if (!Ac(e, n) && !(t.flags & 128)) return rc = !1, jc(e, t, n);
			rc = !!(e.flags & 131072);
		}
		else rc = !1, V && t.flags & 1048576 && Oi(t, xi, t.index);
		switch (t.lanes = 0, t.tag) {
			case 16:
				a: {
					var r = t.pendingProps;
					if (e = Ea(t.elementType), t.type = e, typeof e == "function") ci(e) ? (r = Ks(e, r), t.tag = 1, t = _c(null, t, e, r, n)) : (t.tag = 0, t = hc(null, t, e, r, n));
					else {
						if (e != null) {
							var a = e.$$typeof;
							if (a === w) {
								t.tag = 11, t = ac(null, t, e, r, n);
								break a;
							} else if (a === E) {
								t.tag = 14, t = oc(null, t, e, r, n);
								break a;
							}
						}
						throw t = ae(e) || e, Error(i(306, t, ""));
					}
				}
				return t;
			case 0: return hc(e, t, t.type, t.pendingProps, n);
			case 1: return r = t.type, a = Ks(r, t.pendingProps), _c(e, t, r, a, n);
			case 3:
				a: {
					if (pe(t, t.stateNode.containerInfo), e === null) throw Error(i(387));
					r = t.pendingProps;
					var o = t.memoizedState;
					a = o.element, Ba(e, t), qa(t, r, null, n);
					var s = t.memoizedState;
					if (r = s.cache, Ki(t, aa, r), r !== o.cache && Yi(t, [aa], n, !0), Ka(), r = s.element, o.isDehydrated) if (o = {
						element: r,
						isDehydrated: !1,
						cache: s.cache
					}, t.updateQueue.baseState = o, t.memoizedState = o, t.flags & 256) {
						t = vc(e, t, r, n);
						break a;
					} else if (r !== a) {
						a = _i(Error(i(424)), t), Hi(a), t = vc(e, t, r, n);
						break a;
					} else {
						switch (e = t.stateNode.containerInfo, e.nodeType) {
							case 9:
								e = e.body;
								break;
							default: e = e.nodeName === "HTML" ? e.ownerDocument.body : e;
						}
						for (B = cf(e.firstChild), Mi = t, V = !0, Ni = null, Pi = !0, n = La(t, null, r, n), t.child = n; n;) n.flags = n.flags & -3 | 4096, n = n.sibling;
					}
					else {
						if (Bi(), r === a) {
							t = kc(e, t, n);
							break a;
						}
						ic(e, t, r, n);
					}
					t = t.child;
				}
				return t;
			case 26: return mc(e, t), e === null ? (n = kf(t.type, null, t.pendingProps, null)) ? t.memoizedState = n : V || (n = t.type, e = t.pendingProps, r = Bd(de.current).createElement(n), r[lt] = t, r[ut] = e, Pd(r, n, e), bt(r), t.stateNode = r) : t.memoizedState = kf(t.type, e.memoizedProps, t.pendingProps, e.memoizedState), null;
			case 27: return he(t), e === null && V && (r = t.stateNode = ff(t.type, t.pendingProps, de.current), Mi = t, Pi = !0, a = B, Zd(t.type) ? (lf = a, B = cf(r.firstChild)) : B = a), ic(e, t, t.pendingProps.children, n), mc(e, t), e === null && (t.flags |= 4194304), t.child;
			case 5: return e === null && V && ((a = r = B) && (r = tf(r, t.type, t.pendingProps, Pi), r === null ? a = !1 : (t.stateNode = r, Mi = t, B = cf(r.firstChild), Pi = !1, a = !0)), a || Ii(t)), he(t), a = t.type, o = t.pendingProps, s = e === null ? null : e.memoizedProps, r = o.children, Ud(a, o) ? r = null : s !== null && Ud(a, s) && (t.flags |= 32), t.memoizedState !== null && (a = So(e, t, To, null, null, n), Qf._currentValue = a), mc(e, t), ic(e, t, r, n), t.child;
			case 6: return e === null && V && ((e = n = B) && (n = nf(n, t.pendingProps, Pi), n === null ? e = !1 : (t.stateNode = n, Mi = t, B = null, e = !0)), e || Ii(t)), null;
			case 13: return Sc(e, t, n);
			case 4: return pe(t, t.stateNode.containerInfo), r = t.pendingProps, e === null ? t.child = Ia(t, null, r, n) : ic(e, t, r, n), t.child;
			case 11: return ac(e, t, t.type, t.pendingProps, n);
			case 7: return ic(e, t, t.pendingProps, n), t.child;
			case 8: return ic(e, t, t.pendingProps.children, n), t.child;
			case 12: return ic(e, t, t.pendingProps.children, n), t.child;
			case 10: return r = t.pendingProps, Ki(t, t.type, r.value), ic(e, t, r.children, n), t.child;
			case 9: return a = t.type._context, r = t.pendingProps.children, Qi(t), a = $i(a), r = r(a), t.flags |= 1, ic(e, t, r, n), t.child;
			case 14: return oc(e, t, t.type, t.pendingProps, n);
			case 15: return sc(e, t, t.type, t.pendingProps, n);
			case 19: return Oc(e, t, n);
			case 31: return pc(e, t, n);
			case 22: return cc(e, t, n, t.pendingProps);
			case 24: return Qi(t), r = $i(aa), e === null ? (a = _a(), a === null && (a = q, o = oa(), a.pooledCache = o, o.refCount++, o !== null && (a.pooledCacheLanes |= n), a = o), t.memoizedState = {
				parent: r,
				cache: a
			}, za(t), Ki(t, aa, a)) : ((e.lanes & n) !== 0 && (Ba(e, t), qa(t, null, null, n), Ka()), a = e.memoizedState, o = t.memoizedState, a.parent === r ? (r = o.cache, Ki(t, aa, r), r !== a.cache && Yi(t, [aa], n, !0)) : (a = {
				parent: r,
				cache: r
			}, t.memoizedState = a, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = a), Ki(t, aa, r))), ic(e, t, t.pendingProps.children, n), t.child;
			case 29: throw t.pendingProps;
		}
		throw Error(i(156, t.tag));
	}
	function Nc(e) {
		e.flags |= 4;
	}
	function Pc(e, t, n, r, i) {
		if ((t = (e.mode & 32) != 0) && (t = !1), t) {
			if (e.flags |= 16777216, (i & 335544128) === i) if (e.stateNode.complete) e.flags |= 8192;
			else if (wu()) e.flags |= 8192;
			else throw Da = Ca, xa;
		} else e.flags &= -16777217;
	}
	function Fc(e, t) {
		if (t.type !== "stylesheet" || t.state.loading & 4) e.flags &= -16777217;
		else if (e.flags |= 16777216, !Wf(t)) if (wu()) e.flags |= 8192;
		else throw Da = Ca, xa;
	}
	function Ic(e, t) {
		t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag === 22 ? 536870912 : Qe(), e.lanes |= t, Yl |= t);
	}
	function Lc(e, t) {
		if (!V) switch (e.tailMode) {
			case "hidden":
				t = e.tail;
				for (var n = null; t !== null;) t.alternate !== null && (n = t), t = t.sibling;
				n === null ? e.tail = null : n.sibling = null;
				break;
			case "collapsed":
				n = e.tail;
				for (var r = null; n !== null;) n.alternate !== null && (r = n), n = n.sibling;
				r === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : r.sibling = null;
		}
	}
	function W(e) {
		var t = e.alternate !== null && e.alternate.child === e.child, n = 0, r = 0;
		if (t) for (var i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags & 65011712, r |= i.flags & 65011712, i.return = e, i = i.sibling;
		else for (i = e.child; i !== null;) n |= i.lanes | i.childLanes, r |= i.subtreeFlags, r |= i.flags, i.return = e, i = i.sibling;
		return e.subtreeFlags |= r, e.childLanes = n, t;
	}
	function Rc(e, t, n) {
		var r = t.pendingProps;
		switch (Ai(t), t.tag) {
			case 16:
			case 15:
			case 0:
			case 11:
			case 7:
			case 8:
			case 12:
			case 9:
			case 14: return W(t), null;
			case 1: return W(t), null;
			case 3: return n = t.stateNode, r = null, e !== null && (r = e.memoizedState.cache), t.memoizedState.cache !== r && (t.flags |= 2048), qi(aa), me(), n.pendingContext && (n.context = n.pendingContext, n.pendingContext = null), (e === null || e.child === null) && (zi(t) ? Nc(t) : e === null || e.memoizedState.isDehydrated && !(t.flags & 256) || (t.flags |= 1024, Vi())), W(t), null;
			case 26:
				var a = t.type, o = t.memoizedState;
				return e === null ? (Nc(t), o === null ? (W(t), Pc(t, a, null, r, n)) : (W(t), Fc(t, o))) : o ? o === e.memoizedState ? (W(t), t.flags &= -16777217) : (Nc(t), W(t), Fc(t, o)) : (e = e.memoizedProps, e !== r && Nc(t), W(t), Pc(t, a, e, r, n)), null;
			case 27:
				if (ge(t), n = de.current, a = t.type, e !== null && t.stateNode != null) e.memoizedProps !== r && Nc(t);
				else {
					if (!r) {
						if (t.stateNode === null) throw Error(i(166));
						return W(t), null;
					}
					e = ue.current, zi(t) ? Li(t, e) : (e = ff(a, r, n), t.stateNode = e, Nc(t));
				}
				return W(t), null;
			case 5:
				if (ge(t), a = t.type, e !== null && t.stateNode != null) e.memoizedProps !== r && Nc(t);
				else {
					if (!r) {
						if (t.stateNode === null) throw Error(i(166));
						return W(t), null;
					}
					if (o = ue.current, zi(t)) Li(t, o);
					else {
						var s = Bd(de.current);
						switch (o) {
							case 1:
								o = s.createElementNS("http://www.w3.org/2000/svg", a);
								break;
							case 2:
								o = s.createElementNS("http://www.w3.org/1998/Math/MathML", a);
								break;
							default: switch (a) {
								case "svg":
									o = s.createElementNS("http://www.w3.org/2000/svg", a);
									break;
								case "math":
									o = s.createElementNS("http://www.w3.org/1998/Math/MathML", a);
									break;
								case "script":
									o = s.createElement("div"), o.innerHTML = "<script><\/script>", o = o.removeChild(o.firstChild);
									break;
								case "select":
									o = typeof r.is == "string" ? s.createElement("select", { is: r.is }) : s.createElement("select"), r.multiple ? o.multiple = !0 : r.size && (o.size = r.size);
									break;
								default: o = typeof r.is == "string" ? s.createElement(a, { is: r.is }) : s.createElement(a);
							}
						}
						o[lt] = t, o[ut] = r;
						a: for (s = t.child; s !== null;) {
							if (s.tag === 5 || s.tag === 6) o.appendChild(s.stateNode);
							else if (s.tag !== 4 && s.tag !== 27 && s.child !== null) {
								s.child.return = s, s = s.child;
								continue;
							}
							if (s === t) break a;
							for (; s.sibling === null;) {
								if (s.return === null || s.return === t) break a;
								s = s.return;
							}
							s.sibling.return = s.return, s = s.sibling;
						}
						t.stateNode = o;
						a: switch (Pd(o, a, r), a) {
							case "button":
							case "input":
							case "select":
							case "textarea":
								r = !!r.autoFocus;
								break a;
							case "img":
								r = !0;
								break a;
							default: r = !1;
						}
						r && Nc(t);
					}
				}
				return W(t), Pc(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, n), null;
			case 6:
				if (e && t.stateNode != null) e.memoizedProps !== r && Nc(t);
				else {
					if (typeof r != "string" && t.stateNode === null) throw Error(i(166));
					if (e = de.current, zi(t)) {
						if (e = t.stateNode, n = t.memoizedProps, r = null, a = Mi, a !== null) switch (a.tag) {
							case 27:
							case 5: r = a.memoizedProps;
						}
						e[lt] = t, e = !!(e.nodeValue === n || r !== null && !0 === r.suppressHydrationWarning || Md(e.nodeValue, n)), e || Ii(t, !0);
					} else e = Bd(e).createTextNode(r), e[lt] = t, t.stateNode = e;
				}
				return W(t), null;
			case 31:
				if (n = t.memoizedState, e === null || e.memoizedState !== null) {
					if (r = zi(t), n !== null) {
						if (e === null) {
							if (!r) throw Error(i(318));
							if (e = t.memoizedState, e = e === null ? null : e.dehydrated, !e) throw Error(i(557));
							e[lt] = t;
						} else Bi(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
						W(t), e = !1;
					} else n = Vi(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = n), e = !0;
					if (!e) return t.flags & 256 ? (so(t), t) : (so(t), null);
					if (t.flags & 128) throw Error(i(558));
				}
				return W(t), null;
			case 13:
				if (r = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
					if (a = zi(t), r !== null && r.dehydrated !== null) {
						if (e === null) {
							if (!a) throw Error(i(318));
							if (a = t.memoizedState, a = a === null ? null : a.dehydrated, !a) throw Error(i(317));
							a[lt] = t;
						} else Bi(), !(t.flags & 128) && (t.memoizedState = null), t.flags |= 4;
						W(t), a = !1;
					} else a = Vi(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = a), a = !0;
					if (!a) return t.flags & 256 ? (so(t), t) : (so(t), null);
				}
				return so(t), t.flags & 128 ? (t.lanes = n, t) : (n = r !== null, e = e !== null && e.memoizedState !== null, n && (r = t.child, a = null, r.alternate !== null && r.alternate.memoizedState !== null && r.alternate.memoizedState.cachePool !== null && (a = r.alternate.memoizedState.cachePool.pool), o = null, r.memoizedState !== null && r.memoizedState.cachePool !== null && (o = r.memoizedState.cachePool.pool), o !== a && (r.flags |= 2048)), n !== e && n && (t.child.flags |= 8192), Ic(t, t.updateQueue), W(t), null);
			case 4: return me(), e === null && Sd(t.stateNode.containerInfo), W(t), null;
			case 10: return qi(t.type), W(t), null;
			case 19:
				if (M(co), r = t.memoizedState, r === null) return W(t), null;
				if (a = (t.flags & 128) != 0, o = r.rendering, o === null) if (a) Lc(r, !1);
				else {
					if (Wl !== 0 || e !== null && e.flags & 128) for (e = t.child; e !== null;) {
						if (o = lo(e), o !== null) {
							for (t.flags |= 128, Lc(r, !1), e = o.updateQueue, t.updateQueue = e, Ic(t, e), t.subtreeFlags = 0, e = n, n = t.child; n !== null;) ui(n, e), n = n.sibling;
							return N(co, co.current & 1 | 2), V && Di(t, r.treeForkCount), t.child;
						}
						e = e.sibling;
					}
					r.tail !== null && ke() > tu && (t.flags |= 128, a = !0, Lc(r, !1), t.lanes = 4194304);
				}
				else {
					if (!a) if (e = lo(o), e !== null) {
						if (t.flags |= 128, a = !0, e = e.updateQueue, t.updateQueue = e, Ic(t, e), Lc(r, !0), r.tail === null && r.tailMode === "hidden" && !o.alternate && !V) return W(t), null;
					} else 2 * ke() - r.renderingStartTime > tu && n !== 536870912 && (t.flags |= 128, a = !0, Lc(r, !1), t.lanes = 4194304);
					r.isBackwards ? (o.sibling = t.child, t.child = o) : (e = r.last, e === null ? t.child = o : e.sibling = o, r.last = o);
				}
				return r.tail === null ? (W(t), null) : (e = r.tail, r.rendering = e, r.tail = e.sibling, r.renderingStartTime = ke(), e.sibling = null, n = co.current, N(co, a ? n & 1 | 2 : n & 1), V && Di(t, r.treeForkCount), e);
			case 22:
			case 23: return so(t), eo(), r = t.memoizedState !== null, e === null ? r && (t.flags |= 8192) : e.memoizedState !== null !== r && (t.flags |= 8192), r ? n & 536870912 && !(t.flags & 128) && (W(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : W(t), n = t.updateQueue, n !== null && Ic(t, n.retryQueue), n = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), r = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (r = t.memoizedState.cachePool.pool), r !== n && (t.flags |= 2048), e !== null && M(ga), null;
			case 24: return n = null, e !== null && (n = e.memoizedState.cache), t.memoizedState.cache !== n && (t.flags |= 2048), qi(aa), W(t), null;
			case 25: return null;
			case 30: return null;
		}
		throw Error(i(156, t.tag));
	}
	function zc(e, t) {
		switch (Ai(t), t.tag) {
			case 1: return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 3: return qi(aa), me(), e = t.flags, e & 65536 && !(e & 128) ? (t.flags = e & -65537 | 128, t) : null;
			case 26:
			case 27:
			case 5: return ge(t), null;
			case 31:
				if (t.memoizedState !== null) {
					if (so(t), t.alternate === null) throw Error(i(340));
					Bi();
				}
				return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 13:
				if (so(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
					if (t.alternate === null) throw Error(i(340));
					Bi();
				}
				return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 19: return M(co), null;
			case 4: return me(), null;
			case 10: return qi(t.type), null;
			case 22:
			case 23: return so(t), eo(), e !== null && M(ga), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
			case 24: return qi(aa), null;
			case 25: return null;
			default: return null;
		}
	}
	function Bc(e, t) {
		switch (Ai(t), t.tag) {
			case 3:
				qi(aa), me();
				break;
			case 26:
			case 27:
			case 5:
				ge(t);
				break;
			case 4:
				me();
				break;
			case 31:
				t.memoizedState !== null && so(t);
				break;
			case 13:
				so(t);
				break;
			case 19:
				M(co);
				break;
			case 10:
				qi(t.type);
				break;
			case 22:
			case 23:
				so(t), eo(), e !== null && M(ga);
				break;
			case 24: qi(aa);
		}
	}
	function Vc(e, t) {
		try {
			var n = t.updateQueue, r = n === null ? null : n.lastEffect;
			if (r !== null) {
				var i = r.next;
				n = i;
				do {
					if ((n.tag & e) === e) {
						r = void 0;
						var a = n.create, o = n.inst;
						r = a(), o.destroy = r;
					}
					n = n.next;
				} while (n !== i);
			}
		} catch (e) {
			Z(t, t.return, e);
		}
	}
	function Hc(e, t, n) {
		try {
			var r = t.updateQueue, i = r === null ? null : r.lastEffect;
			if (i !== null) {
				var a = i.next;
				r = a;
				do {
					if ((r.tag & e) === e) {
						var o = r.inst, s = o.destroy;
						if (s !== void 0) {
							o.destroy = void 0, i = t;
							var c = n, l = s;
							try {
								l();
							} catch (e) {
								Z(i, c, e);
							}
						}
					}
					r = r.next;
				} while (r !== a);
			}
		} catch (e) {
			Z(t, t.return, e);
		}
	}
	function Uc(e) {
		var t = e.updateQueue;
		if (t !== null) {
			var n = e.stateNode;
			try {
				Ya(t, n);
			} catch (t) {
				Z(e, e.return, t);
			}
		}
	}
	function Wc(e, t, n) {
		n.props = Ks(e.type, e.memoizedProps), n.state = e.memoizedState;
		try {
			n.componentWillUnmount();
		} catch (n) {
			Z(e, t, n);
		}
	}
	function Gc(e, t) {
		try {
			var n = e.ref;
			if (n !== null) {
				switch (e.tag) {
					case 26:
					case 27:
					case 5:
						var r = e.stateNode;
						break;
					case 30:
						r = e.stateNode;
						break;
					default: r = e.stateNode;
				}
				typeof n == "function" ? e.refCleanup = n(r) : n.current = r;
			}
		} catch (n) {
			Z(e, t, n);
		}
	}
	function Kc(e, t) {
		var n = e.ref, r = e.refCleanup;
		if (n !== null) if (typeof r == "function") try {
			r();
		} catch (n) {
			Z(e, t, n);
		} finally {
			e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
		}
		else if (typeof n == "function") try {
			n(null);
		} catch (n) {
			Z(e, t, n);
		}
		else n.current = null;
	}
	function qc(e) {
		var t = e.type, n = e.memoizedProps, r = e.stateNode;
		try {
			a: switch (t) {
				case "button":
				case "input":
				case "select":
				case "textarea":
					n.autoFocus && r.focus();
					break a;
				case "img": n.src ? r.src = n.src : n.srcSet && (r.srcset = n.srcSet);
			}
		} catch (t) {
			Z(e, e.return, t);
		}
	}
	function Jc(e, t, n) {
		try {
			var r = e.stateNode;
			Fd(r, e.type, n, t), r[ut] = t;
		} catch (t) {
			Z(e, e.return, t);
		}
	}
	function Yc(e) {
		return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && Zd(e.type) || e.tag === 4;
	}
	function Xc(e) {
		a: for (;;) {
			for (; e.sibling === null;) {
				if (e.return === null || Yc(e.return)) return null;
				e = e.return;
			}
			for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18;) {
				if (e.tag === 27 && Zd(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue a;
				e.child.return = e, e = e.child;
			}
			if (!(e.flags & 2)) return e.stateNode;
		}
	}
	function Zc(e, t, n) {
		var r = e.tag;
		if (r === 5 || r === 6) e = e.stateNode, t ? (n.nodeType === 9 ? n.body : n.nodeName === "HTML" ? n.ownerDocument.body : n).insertBefore(e, t) : (t = n.nodeType === 9 ? n.body : n.nodeName === "HTML" ? n.ownerDocument.body : n, t.appendChild(e), n = n._reactRootContainer, n != null || t.onclick !== null || (t.onclick = $t));
		else if (r !== 4 && (r === 27 && Zd(e.type) && (n = e.stateNode, t = null), e = e.child, e !== null)) for (Zc(e, t, n), e = e.sibling; e !== null;) Zc(e, t, n), e = e.sibling;
	}
	function Qc(e, t, n) {
		var r = e.tag;
		if (r === 5 || r === 6) e = e.stateNode, t ? n.insertBefore(e, t) : n.appendChild(e);
		else if (r !== 4 && (r === 27 && Zd(e.type) && (n = e.stateNode), e = e.child, e !== null)) for (Qc(e, t, n), e = e.sibling; e !== null;) Qc(e, t, n), e = e.sibling;
	}
	function $c(e) {
		var t = e.stateNode, n = e.memoizedProps;
		try {
			for (var r = e.type, i = t.attributes; i.length;) t.removeAttributeNode(i[0]);
			Pd(t, r, n), t[lt] = e, t[ut] = n;
		} catch (t) {
			Z(e, e.return, t);
		}
	}
	var el = !1, tl = !1, nl = !1, rl = typeof WeakSet == "function" ? WeakSet : Set, il = null;
	function al(e, t) {
		if (e = e.containerInfo, Rd = sp, e = Dr(e), Or(e)) {
			if ("selectionStart" in e) var n = {
				start: e.selectionStart,
				end: e.selectionEnd
			};
			else a: {
				n = (n = e.ownerDocument) && n.defaultView || window;
				var r = n.getSelection && n.getSelection();
				if (r && r.rangeCount !== 0) {
					n = r.anchorNode;
					var a = r.anchorOffset, o = r.focusNode;
					r = r.focusOffset;
					try {
						n.nodeType, o.nodeType;
					} catch {
						n = null;
						break a;
					}
					var s = 0, c = -1, l = -1, u = 0, d = 0, f = e, p = null;
					b: for (;;) {
						for (var m; f !== n || a !== 0 && f.nodeType !== 3 || (c = s + a), f !== o || r !== 0 && f.nodeType !== 3 || (l = s + r), f.nodeType === 3 && (s += f.nodeValue.length), (m = f.firstChild) !== null;) p = f, f = m;
						for (;;) {
							if (f === e) break b;
							if (p === n && ++u === a && (c = s), p === o && ++d === r && (l = s), (m = f.nextSibling) !== null) break;
							f = p, p = f.parentNode;
						}
						f = m;
					}
					n = c === -1 || l === -1 ? null : {
						start: c,
						end: l
					};
				} else n = null;
			}
			n ||= {
				start: 0,
				end: 0
			};
		} else n = null;
		for (zd = {
			focusedElem: e,
			selectionRange: n
		}, sp = !1, il = t; il !== null;) if (t = il, e = t.child, t.subtreeFlags & 1028 && e !== null) e.return = t, il = e;
		else for (; il !== null;) {
			switch (t = il, o = t.alternate, e = t.flags, t.tag) {
				case 0:
					if (e & 4 && (e = t.updateQueue, e = e === null ? null : e.events, e !== null)) for (n = 0; n < e.length; n++) a = e[n], a.ref.impl = a.nextImpl;
					break;
				case 11:
				case 15: break;
				case 1:
					if (e & 1024 && o !== null) {
						e = void 0, n = t, a = o.memoizedProps, o = o.memoizedState, r = n.stateNode;
						try {
							var h = Ks(n.type, a);
							e = r.getSnapshotBeforeUpdate(h, o), r.__reactInternalSnapshotBeforeUpdate = e;
						} catch (e) {
							Z(n, n.return, e);
						}
					}
					break;
				case 3:
					if (e & 1024) {
						if (e = t.stateNode.containerInfo, n = e.nodeType, n === 9) ef(e);
						else if (n === 1) switch (e.nodeName) {
							case "HEAD":
							case "HTML":
							case "BODY":
								ef(e);
								break;
							default: e.textContent = "";
						}
					}
					break;
				case 5:
				case 26:
				case 27:
				case 6:
				case 4:
				case 17: break;
				default: if (e & 1024) throw Error(i(163));
			}
			if (e = t.sibling, e !== null) {
				e.return = t.return, il = e;
				break;
			}
			il = t.return;
		}
	}
	function ol(e, t, n) {
		var r = n.flags;
		switch (n.tag) {
			case 0:
			case 11:
			case 15:
				bl(e, n), r & 4 && Vc(5, n);
				break;
			case 1:
				if (bl(e, n), r & 4) if (e = n.stateNode, t === null) try {
					e.componentDidMount();
				} catch (e) {
					Z(n, n.return, e);
				}
				else {
					var i = Ks(n.type, t.memoizedProps);
					t = t.memoizedState;
					try {
						e.componentDidUpdate(i, t, e.__reactInternalSnapshotBeforeUpdate);
					} catch (e) {
						Z(n, n.return, e);
					}
				}
				r & 64 && Uc(n), r & 512 && Gc(n, n.return);
				break;
			case 3:
				if (bl(e, n), r & 64 && (e = n.updateQueue, e !== null)) {
					if (t = null, n.child !== null) switch (n.child.tag) {
						case 27:
						case 5:
							t = n.child.stateNode;
							break;
						case 1: t = n.child.stateNode;
					}
					try {
						Ya(e, t);
					} catch (e) {
						Z(n, n.return, e);
					}
				}
				break;
			case 27: t === null && r & 4 && $c(n);
			case 26:
			case 5:
				bl(e, n), t === null && r & 4 && qc(n), r & 512 && Gc(n, n.return);
				break;
			case 12:
				bl(e, n);
				break;
			case 31:
				bl(e, n), r & 4 && dl(e, n);
				break;
			case 13:
				bl(e, n), r & 4 && fl(e, n), r & 64 && (e = n.memoizedState, e !== null && (e = e.dehydrated, e !== null && (n = Ju.bind(null, n), sf(e, n))));
				break;
			case 22:
				if (r = n.memoizedState !== null || el, !r) {
					t = t !== null && t.memoizedState !== null || tl, i = el;
					var a = tl;
					el = r, (tl = t) && !a ? Sl(e, n, (n.subtreeFlags & 8772) != 0) : bl(e, n), el = i, tl = a;
				}
				break;
			case 30: break;
			default: bl(e, n);
		}
	}
	function sl(e) {
		var t = e.alternate;
		t !== null && (e.alternate = null, sl(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && gt(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
	}
	var G = null, cl = !1;
	function ll(e, t, n) {
		for (n = n.child; n !== null;) ul(e, t, n), n = n.sibling;
	}
	function ul(e, t, n) {
		if (ze && typeof ze.onCommitFiberUnmount == "function") try {
			ze.onCommitFiberUnmount(Re, n);
		} catch {}
		switch (n.tag) {
			case 26:
				tl || Kc(n, t), ll(e, t, n), n.memoizedState ? n.memoizedState.count-- : n.stateNode && (n = n.stateNode, n.parentNode.removeChild(n));
				break;
			case 27:
				tl || Kc(n, t);
				var r = G, i = cl;
				Zd(n.type) && (G = n.stateNode, cl = !1), ll(e, t, n), pf(n.stateNode), G = r, cl = i;
				break;
			case 5: tl || Kc(n, t);
			case 6:
				if (r = G, i = cl, G = null, ll(e, t, n), G = r, cl = i, G !== null) if (cl) try {
					(G.nodeType === 9 ? G.body : G.nodeName === "HTML" ? G.ownerDocument.body : G).removeChild(n.stateNode);
				} catch (e) {
					Z(n, t, e);
				}
				else try {
					G.removeChild(n.stateNode);
				} catch (e) {
					Z(n, t, e);
				}
				break;
			case 18:
				G !== null && (cl ? (e = G, Qd(e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e, n.stateNode), Np(e)) : Qd(G, n.stateNode));
				break;
			case 4:
				r = G, i = cl, G = n.stateNode.containerInfo, cl = !0, ll(e, t, n), G = r, cl = i;
				break;
			case 0:
			case 11:
			case 14:
			case 15:
				Hc(2, n, t), tl || Hc(4, n, t), ll(e, t, n);
				break;
			case 1:
				tl || (Kc(n, t), r = n.stateNode, typeof r.componentWillUnmount == "function" && Wc(n, t, r)), ll(e, t, n);
				break;
			case 21:
				ll(e, t, n);
				break;
			case 22:
				tl = (r = tl) || n.memoizedState !== null, ll(e, t, n), tl = r;
				break;
			default: ll(e, t, n);
		}
	}
	function dl(e, t) {
		if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
			e = e.dehydrated;
			try {
				Np(e);
			} catch (e) {
				Z(t, t.return, e);
			}
		}
	}
	function fl(e, t) {
		if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null)))) try {
			Np(e);
		} catch (e) {
			Z(t, t.return, e);
		}
	}
	function pl(e) {
		switch (e.tag) {
			case 31:
			case 13:
			case 19:
				var t = e.stateNode;
				return t === null && (t = e.stateNode = new rl()), t;
			case 22: return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new rl()), t;
			default: throw Error(i(435, e.tag));
		}
	}
	function ml(e, t) {
		var n = pl(e);
		t.forEach(function(t) {
			if (!n.has(t)) {
				n.add(t);
				var r = Yu.bind(null, e, t);
				t.then(r, r);
			}
		});
	}
	function hl(e, t) {
		var n = t.deletions;
		if (n !== null) for (var r = 0; r < n.length; r++) {
			var a = n[r], o = e, s = t, c = s;
			a: for (; c !== null;) {
				switch (c.tag) {
					case 27:
						if (Zd(c.type)) {
							G = c.stateNode, cl = !1;
							break a;
						}
						break;
					case 5:
						G = c.stateNode, cl = !1;
						break a;
					case 3:
					case 4:
						G = c.stateNode.containerInfo, cl = !0;
						break a;
				}
				c = c.return;
			}
			if (G === null) throw Error(i(160));
			ul(o, s, a), G = null, cl = !1, o = a.alternate, o !== null && (o.return = null), a.return = null;
		}
		if (t.subtreeFlags & 13886) for (t = t.child; t !== null;) _l(t, e), t = t.sibling;
	}
	var gl = null;
	function _l(e, t) {
		var n = e.alternate, r = e.flags;
		switch (e.tag) {
			case 0:
			case 11:
			case 14:
			case 15:
				hl(t, e), vl(e), r & 4 && (Hc(3, e, e.return), Vc(3, e), Hc(5, e, e.return));
				break;
			case 1:
				hl(t, e), vl(e), r & 512 && (tl || n === null || Kc(n, n.return)), r & 64 && el && (e = e.updateQueue, e !== null && (r = e.callbacks, r !== null && (n = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = n === null ? r : n.concat(r))));
				break;
			case 26:
				var a = gl;
				if (hl(t, e), vl(e), r & 512 && (tl || n === null || Kc(n, n.return)), r & 4) {
					var o = n === null ? null : n.memoizedState;
					if (r = e.memoizedState, n === null) if (r === null) if (e.stateNode === null) {
						a: {
							r = e.type, n = e.memoizedProps, a = a.ownerDocument || a;
							b: switch (r) {
								case "title":
									o = a.getElementsByTagName("title")[0], (!o || o[ht] || o[lt] || o.namespaceURI === "http://www.w3.org/2000/svg" || o.hasAttribute("itemprop")) && (o = a.createElement(r), a.head.insertBefore(o, a.querySelector("head > title"))), Pd(o, r, n), o[lt] = e, bt(o), r = o;
									break a;
								case "link":
									var s = Vf("link", "href", a).get(r + (n.href || ""));
									if (s) {
										for (var c = 0; c < s.length; c++) if (o = s[c], o.getAttribute("href") === (n.href == null || n.href === "" ? null : n.href) && o.getAttribute("rel") === (n.rel == null ? null : n.rel) && o.getAttribute("title") === (n.title == null ? null : n.title) && o.getAttribute("crossorigin") === (n.crossOrigin == null ? null : n.crossOrigin)) {
											s.splice(c, 1);
											break b;
										}
									}
									o = a.createElement(r), Pd(o, r, n), a.head.appendChild(o);
									break;
								case "meta":
									if (s = Vf("meta", "content", a).get(r + (n.content || ""))) {
										for (c = 0; c < s.length; c++) if (o = s[c], o.getAttribute("content") === (n.content == null ? null : "" + n.content) && o.getAttribute("name") === (n.name == null ? null : n.name) && o.getAttribute("property") === (n.property == null ? null : n.property) && o.getAttribute("http-equiv") === (n.httpEquiv == null ? null : n.httpEquiv) && o.getAttribute("charset") === (n.charSet == null ? null : n.charSet)) {
											s.splice(c, 1);
											break b;
										}
									}
									o = a.createElement(r), Pd(o, r, n), a.head.appendChild(o);
									break;
								default: throw Error(i(468, r));
							}
							o[lt] = e, bt(o), r = o;
						}
						e.stateNode = r;
					} else Hf(a, e.type, e.stateNode);
					else e.stateNode = If(a, r, e.memoizedProps);
					else o === r ? r === null && e.stateNode !== null && Jc(e, e.memoizedProps, n.memoizedProps) : (o === null ? n.stateNode !== null && (n = n.stateNode, n.parentNode.removeChild(n)) : o.count--, r === null ? Hf(a, e.type, e.stateNode) : If(a, r, e.memoizedProps));
				}
				break;
			case 27:
				hl(t, e), vl(e), r & 512 && (tl || n === null || Kc(n, n.return)), n !== null && r & 4 && Jc(e, e.memoizedProps, n.memoizedProps);
				break;
			case 5:
				if (hl(t, e), vl(e), r & 512 && (tl || n === null || Kc(n, n.return)), e.flags & 32) {
					a = e.stateNode;
					try {
						Gt(a, "");
					} catch (t) {
						Z(e, e.return, t);
					}
				}
				r & 4 && e.stateNode != null && (a = e.memoizedProps, Jc(e, a, n === null ? a : n.memoizedProps)), r & 1024 && (nl = !0);
				break;
			case 6:
				if (hl(t, e), vl(e), r & 4) {
					if (e.stateNode === null) throw Error(i(162));
					r = e.memoizedProps, n = e.stateNode;
					try {
						n.nodeValue = r;
					} catch (t) {
						Z(e, e.return, t);
					}
				}
				break;
			case 3:
				if (Bf = null, a = gl, gl = gf(t.containerInfo), hl(t, e), gl = a, vl(e), r & 4 && n !== null && n.memoizedState.isDehydrated) try {
					Np(t.containerInfo);
				} catch (t) {
					Z(e, e.return, t);
				}
				nl && (nl = !1, yl(e));
				break;
			case 4:
				r = gl, gl = gf(e.stateNode.containerInfo), hl(t, e), vl(e), gl = r;
				break;
			case 12:
				hl(t, e), vl(e);
				break;
			case 31:
				hl(t, e), vl(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ml(e, r)));
				break;
			case 13:
				hl(t, e), vl(e), e.child.flags & 8192 && e.memoizedState !== null != (n !== null && n.memoizedState !== null) && ($l = ke()), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ml(e, r)));
				break;
			case 22:
				a = e.memoizedState !== null;
				var l = n !== null && n.memoizedState !== null, u = el, d = tl;
				if (el = u || a, tl = d || l, hl(t, e), tl = d, el = u, vl(e), r & 8192) a: for (t = e.stateNode, t._visibility = a ? t._visibility & -2 : t._visibility | 1, a && (n === null || l || el || tl || xl(e)), n = null, t = e;;) {
					if (t.tag === 5 || t.tag === 26) {
						if (n === null) {
							l = n = t;
							try {
								if (o = l.stateNode, a) s = o.style, typeof s.setProperty == "function" ? s.setProperty("display", "none", "important") : s.display = "none";
								else {
									c = l.stateNode;
									var f = l.memoizedProps.style, p = f != null && f.hasOwnProperty("display") ? f.display : null;
									c.style.display = p == null || typeof p == "boolean" ? "" : ("" + p).trim();
								}
							} catch (e) {
								Z(l, l.return, e);
							}
						}
					} else if (t.tag === 6) {
						if (n === null) {
							l = t;
							try {
								l.stateNode.nodeValue = a ? "" : l.memoizedProps;
							} catch (e) {
								Z(l, l.return, e);
							}
						}
					} else if (t.tag === 18) {
						if (n === null) {
							l = t;
							try {
								var m = l.stateNode;
								a ? $d(m, !0) : $d(l.stateNode, !1);
							} catch (e) {
								Z(l, l.return, e);
							}
						}
					} else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === e) && t.child !== null) {
						t.child.return = t, t = t.child;
						continue;
					}
					if (t === e) break a;
					for (; t.sibling === null;) {
						if (t.return === null || t.return === e) break a;
						n === t && (n = null), t = t.return;
					}
					n === t && (n = null), t.sibling.return = t.return, t = t.sibling;
				}
				r & 4 && (r = e.updateQueue, r !== null && (n = r.retryQueue, n !== null && (r.retryQueue = null, ml(e, n))));
				break;
			case 19:
				hl(t, e), vl(e), r & 4 && (r = e.updateQueue, r !== null && (e.updateQueue = null, ml(e, r)));
				break;
			case 30: break;
			case 21: break;
			default: hl(t, e), vl(e);
		}
	}
	function vl(e) {
		var t = e.flags;
		if (t & 2) {
			try {
				for (var n, r = e.return; r !== null;) {
					if (Yc(r)) {
						n = r;
						break;
					}
					r = r.return;
				}
				if (n == null) throw Error(i(160));
				switch (n.tag) {
					case 27:
						var a = n.stateNode;
						Qc(e, Xc(e), a);
						break;
					case 5:
						var o = n.stateNode;
						n.flags & 32 && (Gt(o, ""), n.flags &= -33), Qc(e, Xc(e), o);
						break;
					case 3:
					case 4:
						var s = n.stateNode.containerInfo;
						Zc(e, Xc(e), s);
						break;
					default: throw Error(i(161));
				}
			} catch (t) {
				Z(e, e.return, t);
			}
			e.flags &= -3;
		}
		t & 4096 && (e.flags &= -4097);
	}
	function yl(e) {
		if (e.subtreeFlags & 1024) for (e = e.child; e !== null;) {
			var t = e;
			yl(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
		}
	}
	function bl(e, t) {
		if (t.subtreeFlags & 8772) for (t = t.child; t !== null;) ol(e, t.alternate, t), t = t.sibling;
	}
	function xl(e) {
		for (e = e.child; e !== null;) {
			var t = e;
			switch (t.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					Hc(4, t, t.return), xl(t);
					break;
				case 1:
					Kc(t, t.return);
					var n = t.stateNode;
					typeof n.componentWillUnmount == "function" && Wc(t, t.return, n), xl(t);
					break;
				case 27: pf(t.stateNode);
				case 26:
				case 5:
					Kc(t, t.return), xl(t);
					break;
				case 22:
					t.memoizedState === null && xl(t);
					break;
				case 30:
					xl(t);
					break;
				default: xl(t);
			}
			e = e.sibling;
		}
	}
	function Sl(e, t, n) {
		for (n &&= (t.subtreeFlags & 8772) != 0, t = t.child; t !== null;) {
			var r = t.alternate, i = e, a = t, o = a.flags;
			switch (a.tag) {
				case 0:
				case 11:
				case 15:
					Sl(i, a, n), Vc(4, a);
					break;
				case 1:
					if (Sl(i, a, n), r = a, i = r.stateNode, typeof i.componentDidMount == "function") try {
						i.componentDidMount();
					} catch (e) {
						Z(r, r.return, e);
					}
					if (r = a, i = r.updateQueue, i !== null) {
						var s = r.stateNode;
						try {
							var c = i.shared.hiddenCallbacks;
							if (c !== null) for (i.shared.hiddenCallbacks = null, i = 0; i < c.length; i++) Ja(c[i], s);
						} catch (e) {
							Z(r, r.return, e);
						}
					}
					n && o & 64 && Uc(a), Gc(a, a.return);
					break;
				case 27: $c(a);
				case 26:
				case 5:
					Sl(i, a, n), n && r === null && o & 4 && qc(a), Gc(a, a.return);
					break;
				case 12:
					Sl(i, a, n);
					break;
				case 31:
					Sl(i, a, n), n && o & 4 && dl(i, a);
					break;
				case 13:
					Sl(i, a, n), n && o & 4 && fl(i, a);
					break;
				case 22:
					a.memoizedState === null && Sl(i, a, n), Gc(a, a.return);
					break;
				case 30: break;
				default: Sl(i, a, n);
			}
			t = t.sibling;
		}
	}
	function Cl(e, t) {
		var n = null;
		e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (n = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== n && (e != null && e.refCount++, n != null && sa(n));
	}
	function wl(e, t) {
		e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && sa(e));
	}
	function Tl(e, t, n, r) {
		if (t.subtreeFlags & 10256) for (t = t.child; t !== null;) El(e, t, n, r), t = t.sibling;
	}
	function El(e, t, n, r) {
		var i = t.flags;
		switch (t.tag) {
			case 0:
			case 11:
			case 15:
				Tl(e, t, n, r), i & 2048 && Vc(9, t);
				break;
			case 1:
				Tl(e, t, n, r);
				break;
			case 3:
				Tl(e, t, n, r), i & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && sa(e)));
				break;
			case 12:
				if (i & 2048) {
					Tl(e, t, n, r), e = t.stateNode;
					try {
						var a = t.memoizedProps, o = a.id, s = a.onPostCommit;
						typeof s == "function" && s(o, t.alternate === null ? "mount" : "update", e.passiveEffectDuration, -0);
					} catch (e) {
						Z(t, t.return, e);
					}
				} else Tl(e, t, n, r);
				break;
			case 31:
				Tl(e, t, n, r);
				break;
			case 13:
				Tl(e, t, n, r);
				break;
			case 23: break;
			case 22:
				a = t.stateNode, o = t.alternate, t.memoizedState === null ? a._visibility & 2 ? Tl(e, t, n, r) : (a._visibility |= 2, Dl(e, t, n, r, (t.subtreeFlags & 10256) != 0 || !1)) : a._visibility & 2 ? Tl(e, t, n, r) : Ol(e, t), i & 2048 && Cl(o, t);
				break;
			case 24:
				Tl(e, t, n, r), i & 2048 && wl(t.alternate, t);
				break;
			default: Tl(e, t, n, r);
		}
	}
	function Dl(e, t, n, r, i) {
		for (i &&= (t.subtreeFlags & 10256) != 0 || !1, t = t.child; t !== null;) {
			var a = e, o = t, s = n, c = r, l = o.flags;
			switch (o.tag) {
				case 0:
				case 11:
				case 15:
					Dl(a, o, s, c, i), Vc(8, o);
					break;
				case 23: break;
				case 22:
					var u = o.stateNode;
					o.memoizedState === null ? (u._visibility |= 2, Dl(a, o, s, c, i)) : u._visibility & 2 ? Dl(a, o, s, c, i) : Ol(a, o), i && l & 2048 && Cl(o.alternate, o);
					break;
				case 24:
					Dl(a, o, s, c, i), i && l & 2048 && wl(o.alternate, o);
					break;
				default: Dl(a, o, s, c, i);
			}
			t = t.sibling;
		}
	}
	function Ol(e, t) {
		if (t.subtreeFlags & 10256) for (t = t.child; t !== null;) {
			var n = e, r = t, i = r.flags;
			switch (r.tag) {
				case 22:
					Ol(n, r), i & 2048 && Cl(r.alternate, r);
					break;
				case 24:
					Ol(n, r), i & 2048 && wl(r.alternate, r);
					break;
				default: Ol(n, r);
			}
			t = t.sibling;
		}
	}
	var kl = 8192;
	function Al(e, t, n) {
		if (e.subtreeFlags & kl) for (e = e.child; e !== null;) jl(e, t, n), e = e.sibling;
	}
	function jl(e, t, n) {
		switch (e.tag) {
			case 26:
				Al(e, t, n), e.flags & kl && e.memoizedState !== null && Gf(n, gl, e.memoizedState, e.memoizedProps);
				break;
			case 5:
				Al(e, t, n);
				break;
			case 3:
			case 4:
				var r = gl;
				gl = gf(e.stateNode.containerInfo), Al(e, t, n), gl = r;
				break;
			case 22:
				e.memoizedState === null && (r = e.alternate, r !== null && r.memoizedState !== null ? (r = kl, kl = 16777216, Al(e, t, n), kl = r) : Al(e, t, n));
				break;
			default: Al(e, t, n);
		}
	}
	function Ml(e) {
		var t = e.alternate;
		if (t !== null && (e = t.child, e !== null)) {
			t.child = null;
			do
				t = e.sibling, e.sibling = null, e = t;
			while (e !== null);
		}
	}
	function Nl(e) {
		var t = e.deletions;
		if (e.flags & 16) {
			if (t !== null) for (var n = 0; n < t.length; n++) {
				var r = t[n];
				il = r, Il(r, e);
			}
			Ml(e);
		}
		if (e.subtreeFlags & 10256) for (e = e.child; e !== null;) Pl(e), e = e.sibling;
	}
	function Pl(e) {
		switch (e.tag) {
			case 0:
			case 11:
			case 15:
				Nl(e), e.flags & 2048 && Hc(9, e, e.return);
				break;
			case 3:
				Nl(e);
				break;
			case 12:
				Nl(e);
				break;
			case 22:
				var t = e.stateNode;
				e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, Fl(e)) : Nl(e);
				break;
			default: Nl(e);
		}
	}
	function Fl(e) {
		var t = e.deletions;
		if (e.flags & 16) {
			if (t !== null) for (var n = 0; n < t.length; n++) {
				var r = t[n];
				il = r, Il(r, e);
			}
			Ml(e);
		}
		for (e = e.child; e !== null;) {
			switch (t = e, t.tag) {
				case 0:
				case 11:
				case 15:
					Hc(8, t, t.return), Fl(t);
					break;
				case 22:
					n = t.stateNode, n._visibility & 2 && (n._visibility &= -3, Fl(t));
					break;
				default: Fl(t);
			}
			e = e.sibling;
		}
	}
	function Il(e, t) {
		for (; il !== null;) {
			var n = il;
			switch (n.tag) {
				case 0:
				case 11:
				case 15:
					Hc(8, n, t);
					break;
				case 23:
				case 22:
					if (n.memoizedState !== null && n.memoizedState.cachePool !== null) {
						var r = n.memoizedState.cachePool.pool;
						r != null && r.refCount++;
					}
					break;
				case 24: sa(n.memoizedState.cache);
			}
			if (r = n.child, r !== null) r.return = n, il = r;
			else a: for (n = e; il !== null;) {
				r = il;
				var i = r.sibling, a = r.return;
				if (sl(r), r === n) {
					il = null;
					break a;
				}
				if (i !== null) {
					i.return = a, il = i;
					break a;
				}
				il = a;
			}
		}
	}
	var Ll = {
		getCacheForType: function(e) {
			var t = $i(aa), n = t.data.get(e);
			return n === void 0 && (n = e(), t.data.set(e, n)), n;
		},
		cacheSignal: function() {
			return $i(aa).controller.signal;
		}
	}, Rl = typeof WeakMap == "function" ? WeakMap : Map, K = 0, q = null, J = null, Y = 0, X = 0, zl = null, Bl = !1, Vl = !1, Hl = !1, Ul = 0, Wl = 0, Gl = 0, Kl = 0, ql = 0, Jl = 0, Yl = 0, Xl = null, Zl = null, Ql = !1, $l = 0, eu = 0, tu = Infinity, nu = null, ru = null, iu = 0, au = null, ou = null, su = 0, cu = 0, lu = null, uu = null, du = 0, fu = null;
	function pu() {
		return K & 2 && Y !== 0 ? Y & -Y : k.T === null ? ot() : dd();
	}
	function mu() {
		if (Jl === 0) if (!(Y & 536870912) || V) {
			var e = Ke;
			Ke <<= 1, !(Ke & 3932160) && (Ke = 262144), Jl = e;
		} else Jl = 536870912;
		return e = to.current, e !== null && (e.flags |= 32), Jl;
	}
	function hu(e, t, n) {
		(e === q && (X === 2 || X === 9) || e.cancelPendingCommit !== null) && (Su(e, 0), yu(e, Y, Jl, !1)), F(e, n), (!(K & 2) || e !== q) && (e === q && (!(K & 2) && (Kl |= n), Wl === 4 && yu(e, Y, Jl, !1)), rd(e));
	}
	function gu(e, t, n) {
		if (K & 6) throw Error(i(327));
		var r = !n && (t & 127) == 0 && (t & e.expiredLanes) === 0 || Xe(e, t), a = r ? Au(e, t) : Ou(e, t, !0), o = r;
		do {
			if (a === 0) {
				Vl && !r && yu(e, t, 0, !1);
				break;
			} else {
				if (n = e.current.alternate, o && !vu(n)) {
					a = Ou(e, t, !1), o = !1;
					continue;
				}
				if (a === 2) {
					if (o = t, e.errorRecoveryDisabledLanes & o) var s = 0;
					else s = e.pendingLanes & -536870913, s = s === 0 ? s & 536870912 ? 536870912 : 0 : s;
					if (s !== 0) {
						t = s;
						a: {
							var c = e;
							a = Xl;
							var l = c.current.memoizedState.isDehydrated;
							if (l && (Su(c, s).flags |= 256), s = Ou(c, s, !1), s !== 2) {
								if (Hl && !l) {
									c.errorRecoveryDisabledLanes |= o, Kl |= o, a = 4;
									break a;
								}
								o = Zl, Zl = a, o !== null && (Zl === null ? Zl = o : Zl.push.apply(Zl, o));
							}
							a = s;
						}
						if (o = !1, a !== 2) continue;
					}
				}
				if (a === 1) {
					Su(e, 0), yu(e, t, 0, !0);
					break;
				}
				a: {
					switch (r = e, o = a, o) {
						case 0:
						case 1: throw Error(i(345));
						case 4: if ((t & 4194048) !== t) break;
						case 6:
							yu(r, t, Jl, !Bl);
							break a;
						case 2:
							Zl = null;
							break;
						case 3:
						case 5: break;
						default: throw Error(i(329));
					}
					if ((t & 62914560) === t && (a = $l + 300 - ke(), 10 < a)) {
						if (yu(r, t, Jl, !Bl), Ye(r, 0, !0) !== 0) break a;
						su = t, r.timeoutHandle = Kd(_u.bind(null, r, n, Zl, nu, Ql, t, Jl, Kl, Yl, Bl, o, "Throttled", -0, 0), a);
						break a;
					}
					_u(r, n, Zl, nu, Ql, t, Jl, Kl, Yl, Bl, o, null, -0, 0);
				}
			}
			break;
		} while (1);
		rd(e);
	}
	function _u(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
		if (e.timeoutHandle = -1, d = t.subtreeFlags, d & 8192 || (d & 16785408) == 16785408) {
			d = {
				stylesheets: null,
				count: 0,
				imgCount: 0,
				imgBytes: 0,
				suspenseyImages: [],
				waitingForImages: !0,
				waitingForViewTransition: !1,
				unsuspend: $t
			}, jl(t, a, d);
			var m = (a & 62914560) === a ? $l - ke() : (a & 4194048) === a ? eu - ke() : 0;
			if (m = qf(d, m), m !== null) {
				su = a, e.cancelPendingCommit = m(Lu.bind(null, e, t, a, n, r, i, o, s, c, u, d, null, f, p)), yu(e, a, o, !l);
				return;
			}
		}
		Lu(e, t, a, n, r, i, o, s, c);
	}
	function vu(e) {
		for (var t = e;;) {
			var n = t.tag;
			if ((n === 0 || n === 11 || n === 15) && t.flags & 16384 && (n = t.updateQueue, n !== null && (n = n.stores, n !== null))) for (var r = 0; r < n.length; r++) {
				var i = n[r], a = i.getSnapshot;
				i = i.value;
				try {
					if (!Sr(a(), i)) return !1;
				} catch {
					return !1;
				}
			}
			if (n = t.child, t.subtreeFlags & 16384 && n !== null) n.return = t, t = n;
			else {
				if (t === e) break;
				for (; t.sibling === null;) {
					if (t.return === null || t.return === e) return !0;
					t = t.return;
				}
				t.sibling.return = t.return, t = t.sibling;
			}
		}
		return !0;
	}
	function yu(e, t, n, r) {
		t &= ~ql, t &= ~Kl, e.suspendedLanes |= t, e.pingedLanes &= ~t, r && (e.warmLanes |= t), r = e.expirationTimes;
		for (var i = t; 0 < i;) {
			var a = 31 - Ve(i), o = 1 << a;
			r[a] = -1, i &= ~o;
		}
		n !== 0 && tt(e, n, t);
	}
	function bu() {
		return K & 6 ? !0 : (id(0, !1), !1);
	}
	function xu() {
		if (J !== null) {
			if (X === 0) var e = J.return;
			else e = J, Gi = Wi = null, Oo(e), Aa = null, ja = 0, e = J;
			for (; e !== null;) Bc(e.alternate, e), e = e.return;
			J = null;
		}
	}
	function Su(e, t) {
		var n = e.timeoutHandle;
		n !== -1 && (e.timeoutHandle = -1, qd(n)), n = e.cancelPendingCommit, n !== null && (e.cancelPendingCommit = null, n()), su = 0, xu(), q = e, J = n = li(e.current, null), Y = t, X = 0, zl = null, Bl = !1, Vl = Xe(e, t), Hl = !1, Yl = Jl = ql = Kl = Gl = Wl = 0, Zl = Xl = null, Ql = !1, t & 8 && (t |= t & 32);
		var r = e.entangledLanes;
		if (r !== 0) for (e = e.entanglements, r &= t; 0 < r;) {
			var i = 31 - Ve(r), a = 1 << i;
			t |= e[i], r &= ~a;
		}
		return Ul = t, ei(), n;
	}
	function Cu(e, t) {
		H = null, k.H = Rs, t === ba || t === Sa ? (t = Oa(), X = 3) : t === xa ? (t = Oa(), X = 4) : X = t === nc ? 8 : typeof t == "object" && t && typeof t.then == "function" ? 6 : 1, zl = t, J === null && (Wl = 1, Xs(e, _i(t, e.current)));
	}
	function wu() {
		var e = to.current;
		return e === null ? !0 : (Y & 4194048) === Y ? no === null : (Y & 62914560) === Y || Y & 536870912 ? e === no : !1;
	}
	function Tu() {
		var e = k.H;
		return k.H = Rs, e === null ? Rs : e;
	}
	function Eu() {
		var e = k.A;
		return k.A = Ll, e;
	}
	function Du() {
		Wl = 4, Bl || (Y & 4194048) !== Y && to.current !== null || (Vl = !0), !(Gl & 134217727) && !(Kl & 134217727) || q === null || yu(q, Y, Jl, !1);
	}
	function Ou(e, t, n) {
		var r = K;
		K |= 2;
		var i = Tu(), a = Eu();
		(q !== e || Y !== t) && (nu = null, Su(e, t)), t = !1;
		var o = Wl;
		a: do
			try {
				if (X !== 0 && J !== null) {
					var s = J, c = zl;
					switch (X) {
						case 8:
							xu(), o = 6;
							break a;
						case 3:
						case 2:
						case 9:
						case 6:
							to.current === null && (t = !0);
							var l = X;
							if (X = 0, zl = null, Pu(e, s, c, l), n && Vl) {
								o = 0;
								break a;
							}
							break;
						default: l = X, X = 0, zl = null, Pu(e, s, c, l);
					}
				}
				ku(), o = Wl;
				break;
			} catch (t) {
				Cu(e, t);
			}
		while (1);
		return t && e.shellSuspendCounter++, Gi = Wi = null, K = r, k.H = i, k.A = a, J === null && (q = null, Y = 0, ei()), o;
	}
	function ku() {
		for (; J !== null;) Mu(J);
	}
	function Au(e, t) {
		var n = K;
		K |= 2;
		var r = Tu(), a = Eu();
		q !== e || Y !== t ? (nu = null, tu = ke() + 500, Su(e, t)) : Vl = Xe(e, t);
		a: do
			try {
				if (X !== 0 && J !== null) {
					t = J;
					var o = zl;
					b: switch (X) {
						case 1:
							X = 0, zl = null, Pu(e, t, o, 1);
							break;
						case 2:
						case 9:
							if (wa(o)) {
								X = 0, zl = null, Nu(t);
								break;
							}
							t = function() {
								X !== 2 && X !== 9 || q !== e || (X = 7), rd(e);
							}, o.then(t, t);
							break a;
						case 3:
							X = 7;
							break a;
						case 4:
							X = 5;
							break a;
						case 7:
							wa(o) ? (X = 0, zl = null, Nu(t)) : (X = 0, zl = null, Pu(e, t, o, 7));
							break;
						case 5:
							var s = null;
							switch (J.tag) {
								case 26: s = J.memoizedState;
								case 5:
								case 27:
									var c = J;
									if (s ? Wf(s) : c.stateNode.complete) {
										X = 0, zl = null;
										var l = c.sibling;
										if (l !== null) J = l;
										else {
											var u = c.return;
											u === null ? J = null : (J = u, Fu(u));
										}
										break b;
									}
							}
							X = 0, zl = null, Pu(e, t, o, 5);
							break;
						case 6:
							X = 0, zl = null, Pu(e, t, o, 6);
							break;
						case 8:
							xu(), Wl = 6;
							break a;
						default: throw Error(i(462));
					}
				}
				ju();
				break;
			} catch (t) {
				Cu(e, t);
			}
		while (1);
		return Gi = Wi = null, k.H = r, k.A = a, K = n, J === null ? (q = null, Y = 0, ei(), Wl) : 0;
	}
	function ju() {
		for (; J !== null && !De();) Mu(J);
	}
	function Mu(e) {
		var t = Mc(e.alternate, e, Ul);
		e.memoizedProps = e.pendingProps, t === null ? Fu(e) : J = t;
	}
	function Nu(e) {
		var t = e, n = t.alternate;
		switch (t.tag) {
			case 15:
			case 0:
				t = gc(n, t, t.pendingProps, t.type, void 0, Y);
				break;
			case 11:
				t = gc(n, t, t.pendingProps, t.type.render, t.ref, Y);
				break;
			case 5: Oo(t);
			default: Bc(n, t), t = J = ui(t, Ul), t = Mc(n, t, Ul);
		}
		e.memoizedProps = e.pendingProps, t === null ? Fu(e) : J = t;
	}
	function Pu(e, t, n, r) {
		Gi = Wi = null, Oo(t), Aa = null, ja = 0;
		var i = t.return;
		try {
			if (tc(e, i, t, n, Y)) {
				Wl = 1, Xs(e, _i(n, e.current)), J = null;
				return;
			}
		} catch (t) {
			if (i !== null) throw J = i, t;
			Wl = 1, Xs(e, _i(n, e.current)), J = null;
			return;
		}
		t.flags & 32768 ? (V || r === 1 ? e = !0 : Vl || Y & 536870912 ? e = !1 : (Bl = e = !0, (r === 2 || r === 9 || r === 3 || r === 6) && (r = to.current, r !== null && r.tag === 13 && (r.flags |= 16384))), Iu(t, e)) : Fu(t);
	}
	function Fu(e) {
		var t = e;
		do {
			if (t.flags & 32768) {
				Iu(t, Bl);
				return;
			}
			e = t.return;
			var n = Rc(t.alternate, t, Ul);
			if (n !== null) {
				J = n;
				return;
			}
			if (t = t.sibling, t !== null) {
				J = t;
				return;
			}
			J = t = e;
		} while (t !== null);
		Wl === 0 && (Wl = 5);
	}
	function Iu(e, t) {
		do {
			var n = zc(e.alternate, e);
			if (n !== null) {
				n.flags &= 32767, J = n;
				return;
			}
			if (n = e.return, n !== null && (n.flags |= 32768, n.subtreeFlags = 0, n.deletions = null), !t && (e = e.sibling, e !== null)) {
				J = e;
				return;
			}
			J = e = n;
		} while (e !== null);
		Wl = 6, J = null;
	}
	function Lu(e, t, n, r, a, o, s, c, l) {
		e.cancelPendingCommit = null;
		do
			Hu();
		while (iu !== 0);
		if (K & 6) throw Error(i(327));
		if (t !== null) {
			if (t === e.current) throw Error(i(177));
			if (o = t.lanes | t.childLanes, o |= $r, et(e, n, o, s, c, l), e === q && (J = q = null, Y = 0), ou = t, au = e, su = n, cu = o, lu = a, uu = r, t.subtreeFlags & 10256 || t.flags & 10256 ? (e.callbackNode = null, e.callbackPriority = 0, Xu(Ne, function() {
				return Uu(), null;
			})) : (e.callbackNode = null, e.callbackPriority = 0), r = (t.flags & 13878) != 0, t.subtreeFlags & 13878 || r) {
				r = k.T, k.T = null, a = A.p, A.p = 2, s = K, K |= 4;
				try {
					al(e, t, n);
				} finally {
					K = s, A.p = a, k.T = r;
				}
			}
			iu = 1, Ru(), zu(), Bu();
		}
	}
	function Ru() {
		if (iu === 1) {
			iu = 0;
			var e = au, t = ou, n = (t.flags & 13878) != 0;
			if (t.subtreeFlags & 13878 || n) {
				n = k.T, k.T = null;
				var r = A.p;
				A.p = 2;
				var i = K;
				K |= 4;
				try {
					_l(t, e);
					var a = zd, o = Dr(e.containerInfo), s = a.focusedElem, c = a.selectionRange;
					if (o !== s && s && s.ownerDocument && Er(s.ownerDocument.documentElement, s)) {
						if (c !== null && Or(s)) {
							var l = c.start, u = c.end;
							if (u === void 0 && (u = l), "selectionStart" in s) s.selectionStart = l, s.selectionEnd = Math.min(u, s.value.length);
							else {
								var d = s.ownerDocument || document, f = d && d.defaultView || window;
								if (f.getSelection) {
									var p = f.getSelection(), m = s.textContent.length, h = Math.min(c.start, m), g = c.end === void 0 ? h : Math.min(c.end, m);
									!p.extend && h > g && (o = g, g = h, h = o);
									var _ = Tr(s, h), v = Tr(s, g);
									if (_ && v && (p.rangeCount !== 1 || p.anchorNode !== _.node || p.anchorOffset !== _.offset || p.focusNode !== v.node || p.focusOffset !== v.offset)) {
										var y = d.createRange();
										y.setStart(_.node, _.offset), p.removeAllRanges(), h > g ? (p.addRange(y), p.extend(v.node, v.offset)) : (y.setEnd(v.node, v.offset), p.addRange(y));
									}
								}
							}
						}
						for (d = [], p = s; p = p.parentNode;) p.nodeType === 1 && d.push({
							element: p,
							left: p.scrollLeft,
							top: p.scrollTop
						});
						for (typeof s.focus == "function" && s.focus(), s = 0; s < d.length; s++) {
							var b = d[s];
							b.element.scrollLeft = b.left, b.element.scrollTop = b.top;
						}
					}
					sp = !!Rd, zd = Rd = null;
				} finally {
					K = i, A.p = r, k.T = n;
				}
			}
			e.current = t, iu = 2;
		}
	}
	function zu() {
		if (iu === 2) {
			iu = 0;
			var e = au, t = ou, n = (t.flags & 8772) != 0;
			if (t.subtreeFlags & 8772 || n) {
				n = k.T, k.T = null;
				var r = A.p;
				A.p = 2;
				var i = K;
				K |= 4;
				try {
					ol(e, t.alternate, t);
				} finally {
					K = i, A.p = r, k.T = n;
				}
			}
			iu = 3;
		}
	}
	function Bu() {
		if (iu === 4 || iu === 3) {
			iu = 0, Oe();
			var e = au, t = ou, n = su, r = uu;
			t.subtreeFlags & 10256 || t.flags & 10256 ? iu = 5 : (iu = 0, ou = au = null, Vu(e, e.pendingLanes));
			var i = e.pendingLanes;
			if (i === 0 && (ru = null), at(n), t = t.stateNode, ze && typeof ze.onCommitFiberRoot == "function") try {
				ze.onCommitFiberRoot(Re, t, void 0, (t.current.flags & 128) == 128);
			} catch {}
			if (r !== null) {
				t = k.T, i = A.p, A.p = 2, k.T = null;
				try {
					for (var a = e.onRecoverableError, o = 0; o < r.length; o++) {
						var s = r[o];
						a(s.value, { componentStack: s.stack });
					}
				} finally {
					k.T = t, A.p = i;
				}
			}
			su & 3 && Hu(), rd(e), i = e.pendingLanes, n & 261930 && i & 42 ? e === fu ? du++ : (du = 0, fu = e) : du = 0, id(0, !1);
		}
	}
	function Vu(e, t) {
		(e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, sa(t)));
	}
	function Hu() {
		return Ru(), zu(), Bu(), Uu();
	}
	function Uu() {
		if (iu !== 5) return !1;
		var e = au, t = cu;
		cu = 0;
		var n = at(su), r = k.T, a = A.p;
		try {
			A.p = 32 > n ? 32 : n, k.T = null, n = lu, lu = null;
			var o = au, s = su;
			if (iu = 0, ou = au = null, su = 0, K & 6) throw Error(i(331));
			var c = K;
			if (K |= 4, Pl(o.current), El(o, o.current, s, n), K = c, id(0, !1), ze && typeof ze.onPostCommitFiberRoot == "function") try {
				ze.onPostCommitFiberRoot(Re, o);
			} catch {}
			return !0;
		} finally {
			A.p = a, k.T = r, Vu(e, t);
		}
	}
	function Wu(e, t, n) {
		t = _i(n, t), t = Qs(e.stateNode, t, 2), e = Ha(e, t, 2), e !== null && (F(e, 2), rd(e));
	}
	function Z(e, t, n) {
		if (e.tag === 3) Wu(e, e, n);
		else for (; t !== null;) {
			if (t.tag === 3) {
				Wu(t, e, n);
				break;
			} else if (t.tag === 1) {
				var r = t.stateNode;
				if (typeof t.type.getDerivedStateFromError == "function" || typeof r.componentDidCatch == "function" && (ru === null || !ru.has(r))) {
					e = _i(n, e), n = $s(2), r = Ha(t, n, 2), r !== null && (ec(n, r, t, e), F(r, 2), rd(r));
					break;
				}
			}
			t = t.return;
		}
	}
	function Gu(e, t, n) {
		var r = e.pingCache;
		if (r === null) {
			r = e.pingCache = new Rl();
			var i = /* @__PURE__ */ new Set();
			r.set(t, i);
		} else i = r.get(t), i === void 0 && (i = /* @__PURE__ */ new Set(), r.set(t, i));
		i.has(n) || (Hl = !0, i.add(n), e = Ku.bind(null, e, t, n), t.then(e, e));
	}
	function Ku(e, t, n) {
		var r = e.pingCache;
		r !== null && r.delete(t), e.pingedLanes |= e.suspendedLanes & n, e.warmLanes &= ~n, q === e && (Y & n) === n && (Wl === 4 || Wl === 3 && (Y & 62914560) === Y && 300 > ke() - $l ? !(K & 2) && Su(e, 0) : ql |= n, Yl === Y && (Yl = 0)), rd(e);
	}
	function qu(e, t) {
		t === 0 && (t = Qe()), e = ri(e, t), e !== null && (F(e, t), rd(e));
	}
	function Ju(e) {
		var t = e.memoizedState, n = 0;
		t !== null && (n = t.retryLane), qu(e, n);
	}
	function Yu(e, t) {
		var n = 0;
		switch (e.tag) {
			case 31:
			case 13:
				var r = e.stateNode, a = e.memoizedState;
				a !== null && (n = a.retryLane);
				break;
			case 19:
				r = e.stateNode;
				break;
			case 22:
				r = e.stateNode._retryCache;
				break;
			default: throw Error(i(314));
		}
		r !== null && r.delete(t), qu(e, n);
	}
	function Xu(e, t) {
		return Te(e, t);
	}
	var Zu = null, Qu = null, $u = !1, ed = !1, td = !1, nd = 0;
	function rd(e) {
		e !== Qu && e.next === null && (Qu === null ? Zu = Qu = e : Qu = Qu.next = e), ed = !0, $u || ($u = !0, ud());
	}
	function id(e, t) {
		if (!td && ed) {
			td = !0;
			do
				for (var n = !1, r = Zu; r !== null;) {
					if (!t) if (e !== 0) {
						var i = r.pendingLanes;
						if (i === 0) var a = 0;
						else {
							var o = r.suspendedLanes, s = r.pingedLanes;
							a = (1 << 31 - Ve(42 | e) + 1) - 1, a &= i & ~(o & ~s), a = a & 201326741 ? a & 201326741 | 1 : a ? a | 2 : 0;
						}
						a !== 0 && (n = !0, ld(r, a));
					} else a = Y, a = Ye(r, r === q ? a : 0, r.cancelPendingCommit !== null || r.timeoutHandle !== -1), !(a & 3) || Xe(r, a) || (n = !0, ld(r, a));
					r = r.next;
				}
			while (n);
			td = !1;
		}
	}
	function ad() {
		od();
	}
	function od() {
		ed = $u = !1;
		var e = 0;
		nd !== 0 && Gd() && (e = nd);
		for (var t = ke(), n = null, r = Zu; r !== null;) {
			var i = r.next, a = sd(r, t);
			a === 0 ? (r.next = null, n === null ? Zu = i : n.next = i, i === null && (Qu = n)) : (n = r, (e !== 0 || a & 3) && (ed = !0)), r = i;
		}
		iu !== 0 && iu !== 5 || id(e, !1), nd !== 0 && (nd = 0);
	}
	function sd(e, t) {
		for (var n = e.suspendedLanes, r = e.pingedLanes, i = e.expirationTimes, a = e.pendingLanes & -62914561; 0 < a;) {
			var o = 31 - Ve(a), s = 1 << o, c = i[o];
			c === -1 ? ((s & n) === 0 || (s & r) !== 0) && (i[o] = Ze(s, t)) : c <= t && (e.expiredLanes |= s), a &= ~s;
		}
		if (t = q, n = Y, n = Ye(e, e === t ? n : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), r = e.callbackNode, n === 0 || e === t && (X === 2 || X === 9) || e.cancelPendingCommit !== null) return r !== null && r !== null && Ee(r), e.callbackNode = null, e.callbackPriority = 0;
		if (!(n & 3) || Xe(e, n)) {
			if (t = n & -n, t === e.callbackPriority) return t;
			switch (r !== null && Ee(r), at(n)) {
				case 2:
				case 8:
					n = Me;
					break;
				case 32:
					n = Ne;
					break;
				case 268435456:
					n = Fe;
					break;
				default: n = Ne;
			}
			return r = cd.bind(null, e), n = Te(n, r), e.callbackPriority = t, e.callbackNode = n, t;
		}
		return r !== null && r !== null && Ee(r), e.callbackPriority = 2, e.callbackNode = null, 2;
	}
	function cd(e, t) {
		if (iu !== 0 && iu !== 5) return e.callbackNode = null, e.callbackPriority = 0, null;
		var n = e.callbackNode;
		if (Hu() && e.callbackNode !== n) return null;
		var r = Y;
		return r = Ye(e, e === q ? r : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), r === 0 ? null : (gu(e, r, t), sd(e, ke()), e.callbackNode != null && e.callbackNode === n ? cd.bind(null, e) : null);
	}
	function ld(e, t) {
		if (Hu()) return null;
		gu(e, t, !0);
	}
	function ud() {
		Yd(function() {
			K & 6 ? Te(je, ad) : od();
		});
	}
	function dd() {
		if (nd === 0) {
			var e = ua;
			e === 0 && (e = Ge, Ge <<= 1, !(Ge & 261888) && (Ge = 256)), nd = e;
		}
		return nd;
	}
	function fd(e) {
		return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : Qt("" + e);
	}
	function pd(e, t) {
		var n = t.ownerDocument.createElement("input");
		return n.name = t.name, n.value = t.value, e.id && n.setAttribute("form", e.id), t.parentNode.insertBefore(n, t), e = new FormData(e), n.parentNode.removeChild(n), e;
	}
	function md(e, t, n, r, i) {
		if (t === "submit" && n && n.stateNode === i) {
			var a = fd((i[ut] || null).action), o = r.submitter;
			o && (t = (t = o[ut] || null) ? fd(t.formAction) : o.getAttribute("formAction"), t !== null && (a = t, o = null));
			var s = new xn("action", "action", null, r, i);
			e.push({
				event: s,
				listeners: [{
					instance: null,
					listener: function() {
						if (r.defaultPrevented) {
							if (nd !== 0) {
								var e = o ? pd(i, o) : new FormData(i);
								ws(n, {
									pending: !0,
									data: e,
									method: i.method,
									action: a
								}, null, e);
							}
						} else typeof a == "function" && (s.preventDefault(), e = o ? pd(i, o) : new FormData(i), ws(n, {
							pending: !0,
							data: e,
							method: i.method,
							action: a
						}, a, e));
					},
					currentTarget: i
				}]
			});
		}
	}
	for (var hd = 0; hd < Jr.length; hd++) {
		var gd = Jr[hd];
		Yr(gd.toLowerCase(), "on" + (gd[0].toUpperCase() + gd.slice(1)));
	}
	Yr(Br, "onAnimationEnd"), Yr(Vr, "onAnimationIteration"), Yr(Hr, "onAnimationStart"), Yr("dblclick", "onDoubleClick"), Yr("focusin", "onFocus"), Yr("focusout", "onBlur"), Yr(Ur, "onTransitionRun"), Yr(Wr, "onTransitionStart"), Yr(Gr, "onTransitionCancel"), Yr(Kr, "onTransitionEnd"), wt("onMouseEnter", ["mouseout", "mouseover"]), wt("onMouseLeave", ["mouseout", "mouseover"]), wt("onPointerEnter", ["pointerout", "pointerover"]), wt("onPointerLeave", ["pointerout", "pointerover"]), Ct("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), Ct("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), Ct("onBeforeInput", [
		"compositionend",
		"keypress",
		"textInput",
		"paste"
	]), Ct("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), Ct("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), Ct("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
	var _d = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), vd = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(_d));
	function yd(e, t) {
		t = (t & 4) != 0;
		for (var n = 0; n < e.length; n++) {
			var r = e[n], i = r.event;
			r = r.listeners;
			a: {
				var a = void 0;
				if (t) for (var o = r.length - 1; 0 <= o; o--) {
					var s = r[o], c = s.instance, l = s.currentTarget;
					if (s = s.listener, c !== a && i.isPropagationStopped()) break a;
					a = s, i.currentTarget = l;
					try {
						a(i);
					} catch (e) {
						Xr(e);
					}
					i.currentTarget = null, a = c;
				}
				else for (o = 0; o < r.length; o++) {
					if (s = r[o], c = s.instance, l = s.currentTarget, s = s.listener, c !== a && i.isPropagationStopped()) break a;
					a = s, i.currentTarget = l;
					try {
						a(i);
					} catch (e) {
						Xr(e);
					}
					i.currentTarget = null, a = c;
				}
			}
		}
	}
	function Q(e, t) {
		var n = t[dt];
		n === void 0 && (n = t[dt] = /* @__PURE__ */ new Set());
		var r = e + "__bubble";
		n.has(r) || (Cd(t, e, 2, !1), n.add(r));
	}
	function bd(e, t, n) {
		var r = 0;
		t && (r |= 4), Cd(n, e, r, t);
	}
	var xd = "_reactListening" + Math.random().toString(36).slice(2);
	function Sd(e) {
		if (!e[xd]) {
			e[xd] = !0, xt.forEach(function(t) {
				t !== "selectionchange" && (vd.has(t) || bd(t, !1, e), bd(t, !0, e));
			});
			var t = e.nodeType === 9 ? e : e.ownerDocument;
			t === null || t[xd] || (t[xd] = !0, bd("selectionchange", !1, t));
		}
	}
	function Cd(e, t, n, r) {
		switch (mp(t)) {
			case 2:
				var i = cp;
				break;
			case 8:
				i = lp;
				break;
			default: i = up;
		}
		n = i.bind(null, t, n, e), i = void 0, !un || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (i = !0), r ? i === void 0 ? e.addEventListener(t, n, !0) : e.addEventListener(t, n, {
			capture: !0,
			passive: i
		}) : i === void 0 ? e.addEventListener(t, n, !1) : e.addEventListener(t, n, { passive: i });
	}
	function wd(e, t, n, r, i) {
		var a = r;
		if (!(t & 1) && !(t & 2) && r !== null) a: for (;;) {
			if (r === null) return;
			var s = r.tag;
			if (s === 3 || s === 4) {
				var c = r.stateNode.containerInfo;
				if (c === i) break;
				if (s === 4) for (s = r.return; s !== null;) {
					var l = s.tag;
					if ((l === 3 || l === 4) && s.stateNode.containerInfo === i) return;
					s = s.return;
				}
				for (; c !== null;) {
					if (s = _t(c), s === null) return;
					if (l = s.tag, l === 5 || l === 6 || l === 26 || l === 27) {
						r = a = s;
						continue a;
					}
					c = c.parentNode;
				}
			}
			r = r.return;
		}
		sn(function() {
			var r = a, i = tn(n), s = [];
			a: {
				var c = qr.get(e);
				if (c !== void 0) {
					var l = xn, u = e;
					switch (e) {
						case "keypress": if (gn(n) === 0) break a;
						case "keydown":
						case "keyup":
							l = zn;
							break;
						case "focusin":
							u = "focus", l = An;
							break;
						case "focusout":
							u = "blur", l = An;
							break;
						case "beforeblur":
						case "afterblur":
							l = An;
							break;
						case "click": if (n.button === 2) break a;
						case "auxclick":
						case "dblclick":
						case "mousedown":
						case "mousemove":
						case "mouseup":
						case "mouseout":
						case "mouseover":
						case "contextmenu":
							l = On;
							break;
						case "drag":
						case "dragend":
						case "dragenter":
						case "dragexit":
						case "dragleave":
						case "dragover":
						case "dragstart":
						case "drop":
							l = kn;
							break;
						case "touchcancel":
						case "touchend":
						case "touchmove":
						case "touchstart":
							l = Vn;
							break;
						case Br:
						case Vr:
						case Hr:
							l = jn;
							break;
						case Kr:
							l = Hn;
							break;
						case "scroll":
						case "scrollend":
							l = Cn;
							break;
						case "wheel":
							l = Un;
							break;
						case "copy":
						case "cut":
						case "paste":
							l = Mn;
							break;
						case "gotpointercapture":
						case "lostpointercapture":
						case "pointercancel":
						case "pointerdown":
						case "pointermove":
						case "pointerout":
						case "pointerover":
						case "pointerup":
							l = Bn;
							break;
						case "toggle":
						case "beforetoggle": l = Wn;
					}
					var d = (t & 4) != 0, f = !d && (e === "scroll" || e === "scrollend"), p = d ? c === null ? null : c + "Capture" : c;
					d = [];
					for (var m = r, h; m !== null;) {
						var g = m;
						if (h = g.stateNode, g = g.tag, g !== 5 && g !== 26 && g !== 27 || h === null || p === null || (g = cn(m, p), g != null && d.push(Td(m, g, h))), f) break;
						m = m.return;
					}
					0 < d.length && (c = new l(c, u, null, n, i), s.push({
						event: c,
						listeners: d
					}));
				}
			}
			if (!(t & 7)) {
				a: {
					if (c = e === "mouseover" || e === "pointerover", l = e === "mouseout" || e === "pointerout", c && n !== en && (u = n.relatedTarget || n.fromElement) && (_t(u) || u[I])) break a;
					if ((l || c) && (c = i.window === i ? i : (c = i.ownerDocument) ? c.defaultView || c.parentWindow : window, l ? (u = n.relatedTarget || n.toElement, l = r, u = u ? _t(u) : null, u !== null && (f = o(u), d = u.tag, u !== f || d !== 5 && d !== 27 && d !== 6) && (u = null)) : (l = null, u = r), l !== u)) {
						if (d = On, g = "onMouseLeave", p = "onMouseEnter", m = "mouse", (e === "pointerout" || e === "pointerover") && (d = Bn, g = "onPointerLeave", p = "onPointerEnter", m = "pointer"), f = l == null ? c : vt(l), h = u == null ? c : vt(u), c = new d(g, m + "leave", l, n, i), c.target = f, c.relatedTarget = h, g = null, _t(i) === r && (d = new d(p, m + "enter", u, n, i), d.target = h, d.relatedTarget = f, g = d), f = g, l && u) b: {
							for (d = Dd, p = l, m = u, h = 0, g = p; g; g = d(g)) h++;
							g = 0;
							for (var _ = m; _; _ = d(_)) g++;
							for (; 0 < h - g;) p = d(p), h--;
							for (; 0 < g - h;) m = d(m), g--;
							for (; h--;) {
								if (p === m || m !== null && p === m.alternate) {
									d = p;
									break b;
								}
								p = d(p), m = d(m);
							}
							d = null;
						}
						else d = null;
						l !== null && Od(s, c, l, d, !1), u !== null && f !== null && Od(s, f, u, d, !0);
					}
				}
				a: {
					if (c = r ? vt(r) : window, l = c.nodeName && c.nodeName.toLowerCase(), l === "select" || l === "input" && c.type === "file") var v = ur;
					else if (ir(c)) if (dr) v = br;
					else {
						v = vr;
						var y = _r;
					}
					else l = c.nodeName, !l || l.toLowerCase() !== "input" || c.type !== "checkbox" && c.type !== "radio" ? r && Yt(r.elementType) && (v = ur) : v = yr;
					if (v &&= v(e, r)) {
						ar(s, v, n, i);
						break a;
					}
					y && y(e, c, r), e === "focusout" && r && c.type === "number" && r.memoizedProps.value != null && Vt(c, "number", c.value);
				}
				switch (y = r ? vt(r) : window, e) {
					case "focusin":
						(ir(y) || y.contentEditable === "true") && (Ar = y, jr = r, Mr = null);
						break;
					case "focusout":
						Mr = jr = Ar = null;
						break;
					case "mousedown":
						Nr = !0;
						break;
					case "contextmenu":
					case "mouseup":
					case "dragend":
						Nr = !1, Pr(s, n, i);
						break;
					case "selectionchange": if (kr) break;
					case "keydown":
					case "keyup": Pr(s, n, i);
				}
				var b;
				if (Kn) b: {
					switch (e) {
						case "compositionstart":
							var x = "onCompositionStart";
							break b;
						case "compositionend":
							x = "onCompositionEnd";
							break b;
						case "compositionupdate":
							x = "onCompositionUpdate";
							break b;
					}
					x = void 0;
				}
				else er ? Qn(e, n) && (x = "onCompositionEnd") : e === "keydown" && n.keyCode === 229 && (x = "onCompositionStart");
				x && (Yn && n.locale !== "ko" && (er || x !== "onCompositionStart" ? x === "onCompositionEnd" && er && (b = hn()) : (fn = i, pn = "value" in fn ? fn.value : fn.textContent, er = !0)), y = Ed(r, x), 0 < y.length && (x = new Nn(x, e, null, n, i), s.push({
					event: x,
					listeners: y
				}), b ? x.data = b : (b = $n(n), b !== null && (x.data = b)))), (b = Jn ? tr(e, n) : nr(e, n)) && (x = Ed(r, "onBeforeInput"), 0 < x.length && (y = new Nn("onBeforeInput", "beforeinput", null, n, i), s.push({
					event: y,
					listeners: x
				}), y.data = b)), md(s, e, r, n, i);
			}
			yd(s, t);
		});
	}
	function Td(e, t, n) {
		return {
			instance: e,
			listener: t,
			currentTarget: n
		};
	}
	function Ed(e, t) {
		for (var n = t + "Capture", r = []; e !== null;) {
			var i = e, a = i.stateNode;
			if (i = i.tag, i !== 5 && i !== 26 && i !== 27 || a === null || (i = cn(e, n), i != null && r.unshift(Td(e, i, a)), i = cn(e, t), i != null && r.push(Td(e, i, a))), e.tag === 3) return r;
			e = e.return;
		}
		return [];
	}
	function Dd(e) {
		if (e === null) return null;
		do
			e = e.return;
		while (e && e.tag !== 5 && e.tag !== 27);
		return e || null;
	}
	function Od(e, t, n, r, i) {
		for (var a = t._reactName, o = []; n !== null && n !== r;) {
			var s = n, c = s.alternate, l = s.stateNode;
			if (s = s.tag, c !== null && c === r) break;
			s !== 5 && s !== 26 && s !== 27 || l === null || (c = l, i ? (l = cn(n, a), l != null && o.unshift(Td(n, l, c))) : i || (l = cn(n, a), l != null && o.push(Td(n, l, c)))), n = n.return;
		}
		o.length !== 0 && e.push({
			event: t,
			listeners: o
		});
	}
	var kd = /\r\n?/g, Ad = /\u0000|\uFFFD/g;
	function jd(e) {
		return (typeof e == "string" ? e : "" + e).replace(kd, "\n").replace(Ad, "");
	}
	function Md(e, t) {
		return t = jd(t), jd(e) === t;
	}
	function $(e, t, n, r, a, o) {
		switch (n) {
			case "children":
				typeof r == "string" ? t === "body" || t === "textarea" && r === "" || Gt(e, r) : (typeof r == "number" || typeof r == "bigint") && t !== "body" && Gt(e, "" + r);
				break;
			case "className":
				At(e, "class", r);
				break;
			case "tabIndex":
				At(e, "tabindex", r);
				break;
			case "dir":
			case "role":
			case "viewBox":
			case "width":
			case "height":
				At(e, n, r);
				break;
			case "style":
				Jt(e, r, o);
				break;
			case "data": if (t !== "object") {
				At(e, "data", r);
				break;
			}
			case "src":
			case "href":
				if (r === "" && (t !== "a" || n !== "href")) {
					e.removeAttribute(n);
					break;
				}
				if (r == null || typeof r == "function" || typeof r == "symbol" || typeof r == "boolean") {
					e.removeAttribute(n);
					break;
				}
				r = Qt("" + r), e.setAttribute(n, r);
				break;
			case "action":
			case "formAction":
				if (typeof r == "function") {
					e.setAttribute(n, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
					break;
				} else typeof o == "function" && (n === "formAction" ? (t !== "input" && $(e, t, "name", a.name, a, null), $(e, t, "formEncType", a.formEncType, a, null), $(e, t, "formMethod", a.formMethod, a, null), $(e, t, "formTarget", a.formTarget, a, null)) : ($(e, t, "encType", a.encType, a, null), $(e, t, "method", a.method, a, null), $(e, t, "target", a.target, a, null)));
				if (r == null || typeof r == "symbol" || typeof r == "boolean") {
					e.removeAttribute(n);
					break;
				}
				r = Qt("" + r), e.setAttribute(n, r);
				break;
			case "onClick":
				r != null && (e.onclick = $t);
				break;
			case "onScroll":
				r != null && Q("scroll", e);
				break;
			case "onScrollEnd":
				r != null && Q("scrollend", e);
				break;
			case "dangerouslySetInnerHTML":
				if (r != null) {
					if (typeof r != "object" || !("__html" in r)) throw Error(i(61));
					if (n = r.__html, n != null) {
						if (a.children != null) throw Error(i(60));
						e.innerHTML = n;
					}
				}
				break;
			case "multiple":
				e.multiple = r && typeof r != "function" && typeof r != "symbol";
				break;
			case "muted":
				e.muted = r && typeof r != "function" && typeof r != "symbol";
				break;
			case "suppressContentEditableWarning":
			case "suppressHydrationWarning":
			case "defaultValue":
			case "defaultChecked":
			case "innerHTML":
			case "ref": break;
			case "autoFocus": break;
			case "xlinkHref":
				if (r == null || typeof r == "function" || typeof r == "boolean" || typeof r == "symbol") {
					e.removeAttribute("xlink:href");
					break;
				}
				n = Qt("" + r), e.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", n);
				break;
			case "contentEditable":
			case "spellCheck":
			case "draggable":
			case "value":
			case "autoReverse":
			case "externalResourcesRequired":
			case "focusable":
			case "preserveAlpha":
				r != null && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, "" + r) : e.removeAttribute(n);
				break;
			case "inert":
			case "allowFullScreen":
			case "async":
			case "autoPlay":
			case "controls":
			case "default":
			case "defer":
			case "disabled":
			case "disablePictureInPicture":
			case "disableRemotePlayback":
			case "formNoValidate":
			case "hidden":
			case "loop":
			case "noModule":
			case "noValidate":
			case "open":
			case "playsInline":
			case "readOnly":
			case "required":
			case "reversed":
			case "scoped":
			case "seamless":
			case "itemScope":
				r && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, "") : e.removeAttribute(n);
				break;
			case "capture":
			case "download":
				!0 === r ? e.setAttribute(n, "") : !1 !== r && r != null && typeof r != "function" && typeof r != "symbol" ? e.setAttribute(n, r) : e.removeAttribute(n);
				break;
			case "cols":
			case "rows":
			case "size":
			case "span":
				r != null && typeof r != "function" && typeof r != "symbol" && !isNaN(r) && 1 <= r ? e.setAttribute(n, r) : e.removeAttribute(n);
				break;
			case "rowSpan":
			case "start":
				r == null || typeof r == "function" || typeof r == "symbol" || isNaN(r) ? e.removeAttribute(n) : e.setAttribute(n, r);
				break;
			case "popover":
				Q("beforetoggle", e), Q("toggle", e), kt(e, "popover", r);
				break;
			case "xlinkActuate":
				jt(e, "http://www.w3.org/1999/xlink", "xlink:actuate", r);
				break;
			case "xlinkArcrole":
				jt(e, "http://www.w3.org/1999/xlink", "xlink:arcrole", r);
				break;
			case "xlinkRole":
				jt(e, "http://www.w3.org/1999/xlink", "xlink:role", r);
				break;
			case "xlinkShow":
				jt(e, "http://www.w3.org/1999/xlink", "xlink:show", r);
				break;
			case "xlinkTitle":
				jt(e, "http://www.w3.org/1999/xlink", "xlink:title", r);
				break;
			case "xlinkType":
				jt(e, "http://www.w3.org/1999/xlink", "xlink:type", r);
				break;
			case "xmlBase":
				jt(e, "http://www.w3.org/XML/1998/namespace", "xml:base", r);
				break;
			case "xmlLang":
				jt(e, "http://www.w3.org/XML/1998/namespace", "xml:lang", r);
				break;
			case "xmlSpace":
				jt(e, "http://www.w3.org/XML/1998/namespace", "xml:space", r);
				break;
			case "is":
				kt(e, "is", r);
				break;
			case "innerText":
			case "textContent": break;
			default: (!(2 < n.length) || n[0] !== "o" && n[0] !== "O" || n[1] !== "n" && n[1] !== "N") && (n = Xt.get(n) || n, kt(e, n, r));
		}
	}
	function Nd(e, t, n, r, a, o) {
		switch (n) {
			case "style":
				Jt(e, r, o);
				break;
			case "dangerouslySetInnerHTML":
				if (r != null) {
					if (typeof r != "object" || !("__html" in r)) throw Error(i(61));
					if (n = r.__html, n != null) {
						if (a.children != null) throw Error(i(60));
						e.innerHTML = n;
					}
				}
				break;
			case "children":
				typeof r == "string" ? Gt(e, r) : (typeof r == "number" || typeof r == "bigint") && Gt(e, "" + r);
				break;
			case "onScroll":
				r != null && Q("scroll", e);
				break;
			case "onScrollEnd":
				r != null && Q("scrollend", e);
				break;
			case "onClick":
				r != null && (e.onclick = $t);
				break;
			case "suppressContentEditableWarning":
			case "suppressHydrationWarning":
			case "innerHTML":
			case "ref": break;
			case "innerText":
			case "textContent": break;
			default: if (!St.hasOwnProperty(n)) a: {
				if (n[0] === "o" && n[1] === "n" && (a = n.endsWith("Capture"), t = n.slice(2, a ? n.length - 7 : void 0), o = e[ut] || null, o = o == null ? null : o[n], typeof o == "function" && e.removeEventListener(t, o, a), typeof r == "function")) {
					typeof o != "function" && o !== null && (n in e ? e[n] = null : e.hasAttribute(n) && e.removeAttribute(n)), e.addEventListener(t, r, a);
					break a;
				}
				n in e ? e[n] = r : !0 === r ? e.setAttribute(n, "") : kt(e, n, r);
			}
		}
	}
	function Pd(e, t, n) {
		switch (t) {
			case "div":
			case "span":
			case "svg":
			case "path":
			case "a":
			case "g":
			case "p":
			case "li": break;
			case "img":
				Q("error", e), Q("load", e);
				var r = !1, a = !1, o;
				for (o in n) if (n.hasOwnProperty(o)) {
					var s = n[o];
					if (s != null) switch (o) {
						case "src":
							r = !0;
							break;
						case "srcSet":
							a = !0;
							break;
						case "children":
						case "dangerouslySetInnerHTML": throw Error(i(137, t));
						default: $(e, t, o, s, n, null);
					}
				}
				a && $(e, t, "srcSet", n.srcSet, n, null), r && $(e, t, "src", n.src, n, null);
				return;
			case "input":
				Q("invalid", e);
				var c = o = s = a = null, l = null, u = null;
				for (r in n) if (n.hasOwnProperty(r)) {
					var d = n[r];
					if (d != null) switch (r) {
						case "name":
							a = d;
							break;
						case "type":
							s = d;
							break;
						case "checked":
							l = d;
							break;
						case "defaultChecked":
							u = d;
							break;
						case "value":
							o = d;
							break;
						case "defaultValue":
							c = d;
							break;
						case "children":
						case "dangerouslySetInnerHTML":
							if (d != null) throw Error(i(137, t));
							break;
						default: $(e, t, r, d, n, null);
					}
				}
				Bt(e, o, c, l, u, s, a, !1);
				return;
			case "select":
				for (a in Q("invalid", e), r = s = o = null, n) if (n.hasOwnProperty(a) && (c = n[a], c != null)) switch (a) {
					case "value":
						o = c;
						break;
					case "defaultValue":
						s = c;
						break;
					case "multiple": r = c;
					default: $(e, t, a, c, n, null);
				}
				t = o, n = s, e.multiple = !!r, t == null ? n != null && Ht(e, !!r, n, !0) : Ht(e, !!r, t, !1);
				return;
			case "textarea":
				for (s in Q("invalid", e), o = a = r = null, n) if (n.hasOwnProperty(s) && (c = n[s], c != null)) switch (s) {
					case "value":
						r = c;
						break;
					case "defaultValue":
						a = c;
						break;
					case "children":
						o = c;
						break;
					case "dangerouslySetInnerHTML":
						if (c != null) throw Error(i(91));
						break;
					default: $(e, t, s, c, n, null);
				}
				Wt(e, r, a, o);
				return;
			case "option":
				for (l in n) if (n.hasOwnProperty(l) && (r = n[l], r != null)) switch (l) {
					case "selected":
						e.selected = r && typeof r != "function" && typeof r != "symbol";
						break;
					default: $(e, t, l, r, n, null);
				}
				return;
			case "dialog":
				Q("beforetoggle", e), Q("toggle", e), Q("cancel", e), Q("close", e);
				break;
			case "iframe":
			case "object":
				Q("load", e);
				break;
			case "video":
			case "audio":
				for (r = 0; r < _d.length; r++) Q(_d[r], e);
				break;
			case "image":
				Q("error", e), Q("load", e);
				break;
			case "details":
				Q("toggle", e);
				break;
			case "embed":
			case "source":
			case "link": Q("error", e), Q("load", e);
			case "area":
			case "base":
			case "br":
			case "col":
			case "hr":
			case "keygen":
			case "meta":
			case "param":
			case "track":
			case "wbr":
			case "menuitem":
				for (u in n) if (n.hasOwnProperty(u) && (r = n[u], r != null)) switch (u) {
					case "children":
					case "dangerouslySetInnerHTML": throw Error(i(137, t));
					default: $(e, t, u, r, n, null);
				}
				return;
			default: if (Yt(t)) {
				for (d in n) n.hasOwnProperty(d) && (r = n[d], r !== void 0 && Nd(e, t, d, r, n, void 0));
				return;
			}
		}
		for (c in n) n.hasOwnProperty(c) && (r = n[c], r != null && $(e, t, c, r, n, null));
	}
	function Fd(e, t, n, r) {
		switch (t) {
			case "div":
			case "span":
			case "svg":
			case "path":
			case "a":
			case "g":
			case "p":
			case "li": break;
			case "input":
				var a = null, o = null, s = null, c = null, l = null, u = null, d = null;
				for (m in n) {
					var f = n[m];
					if (n.hasOwnProperty(m) && f != null) switch (m) {
						case "checked": break;
						case "value": break;
						case "defaultValue": l = f;
						default: r.hasOwnProperty(m) || $(e, t, m, null, r, f);
					}
				}
				for (var p in r) {
					var m = r[p];
					if (f = n[p], r.hasOwnProperty(p) && (m != null || f != null)) switch (p) {
						case "type":
							o = m;
							break;
						case "name":
							a = m;
							break;
						case "checked":
							u = m;
							break;
						case "defaultChecked":
							d = m;
							break;
						case "value":
							s = m;
							break;
						case "defaultValue":
							c = m;
							break;
						case "children":
						case "dangerouslySetInnerHTML":
							if (m != null) throw Error(i(137, t));
							break;
						default: m !== f && $(e, t, p, m, r, f);
					}
				}
				zt(e, s, c, l, u, d, o, a);
				return;
			case "select":
				for (o in m = s = c = p = null, n) if (l = n[o], n.hasOwnProperty(o) && l != null) switch (o) {
					case "value": break;
					case "multiple": m = l;
					default: r.hasOwnProperty(o) || $(e, t, o, null, r, l);
				}
				for (a in r) if (o = r[a], l = n[a], r.hasOwnProperty(a) && (o != null || l != null)) switch (a) {
					case "value":
						p = o;
						break;
					case "defaultValue":
						c = o;
						break;
					case "multiple": s = o;
					default: o !== l && $(e, t, a, o, r, l);
				}
				t = c, n = s, r = m, p == null ? !!r != !!n && (t == null ? Ht(e, !!n, n ? [] : "", !1) : Ht(e, !!n, t, !0)) : Ht(e, !!n, p, !1);
				return;
			case "textarea":
				for (c in m = p = null, n) if (a = n[c], n.hasOwnProperty(c) && a != null && !r.hasOwnProperty(c)) switch (c) {
					case "value": break;
					case "children": break;
					default: $(e, t, c, null, r, a);
				}
				for (s in r) if (a = r[s], o = n[s], r.hasOwnProperty(s) && (a != null || o != null)) switch (s) {
					case "value":
						p = a;
						break;
					case "defaultValue":
						m = a;
						break;
					case "children": break;
					case "dangerouslySetInnerHTML":
						if (a != null) throw Error(i(91));
						break;
					default: a !== o && $(e, t, s, a, r, o);
				}
				Ut(e, p, m);
				return;
			case "option":
				for (var h in n) if (p = n[h], n.hasOwnProperty(h) && p != null && !r.hasOwnProperty(h)) switch (h) {
					case "selected":
						e.selected = !1;
						break;
					default: $(e, t, h, null, r, p);
				}
				for (l in r) if (p = r[l], m = n[l], r.hasOwnProperty(l) && p !== m && (p != null || m != null)) switch (l) {
					case "selected":
						e.selected = p && typeof p != "function" && typeof p != "symbol";
						break;
					default: $(e, t, l, p, r, m);
				}
				return;
			case "img":
			case "link":
			case "area":
			case "base":
			case "br":
			case "col":
			case "embed":
			case "hr":
			case "keygen":
			case "meta":
			case "param":
			case "source":
			case "track":
			case "wbr":
			case "menuitem":
				for (var g in n) p = n[g], n.hasOwnProperty(g) && p != null && !r.hasOwnProperty(g) && $(e, t, g, null, r, p);
				for (u in r) if (p = r[u], m = n[u], r.hasOwnProperty(u) && p !== m && (p != null || m != null)) switch (u) {
					case "children":
					case "dangerouslySetInnerHTML":
						if (p != null) throw Error(i(137, t));
						break;
					default: $(e, t, u, p, r, m);
				}
				return;
			default: if (Yt(t)) {
				for (var _ in n) p = n[_], n.hasOwnProperty(_) && p !== void 0 && !r.hasOwnProperty(_) && Nd(e, t, _, void 0, r, p);
				for (d in r) p = r[d], m = n[d], !r.hasOwnProperty(d) || p === m || p === void 0 && m === void 0 || Nd(e, t, d, p, r, m);
				return;
			}
		}
		for (var v in n) p = n[v], n.hasOwnProperty(v) && p != null && !r.hasOwnProperty(v) && $(e, t, v, null, r, p);
		for (f in r) p = r[f], m = n[f], !r.hasOwnProperty(f) || p === m || p == null && m == null || $(e, t, f, p, r, m);
	}
	function Id(e) {
		switch (e) {
			case "css":
			case "script":
			case "font":
			case "img":
			case "image":
			case "input":
			case "link": return !0;
			default: return !1;
		}
	}
	function Ld() {
		if (typeof performance.getEntriesByType == "function") {
			for (var e = 0, t = 0, n = performance.getEntriesByType("resource"), r = 0; r < n.length; r++) {
				var i = n[r], a = i.transferSize, o = i.initiatorType, s = i.duration;
				if (a && s && Id(o)) {
					for (o = 0, s = i.responseEnd, r += 1; r < n.length; r++) {
						var c = n[r], l = c.startTime;
						if (l > s) break;
						var u = c.transferSize, d = c.initiatorType;
						u && Id(d) && (c = c.responseEnd, o += u * (c < s ? 1 : (s - l) / (c - l)));
					}
					if (--r, t += 8 * (a + o) / (i.duration / 1e3), e++, 10 < e) break;
				}
			}
			if (0 < e) return t / e / 1e6;
		}
		return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
	}
	var Rd = null, zd = null;
	function Bd(e) {
		return e.nodeType === 9 ? e : e.ownerDocument;
	}
	function Vd(e) {
		switch (e) {
			case "http://www.w3.org/2000/svg": return 1;
			case "http://www.w3.org/1998/Math/MathML": return 2;
			default: return 0;
		}
	}
	function Hd(e, t) {
		if (e === 0) switch (t) {
			case "svg": return 1;
			case "math": return 2;
			default: return 0;
		}
		return e === 1 && t === "foreignObject" ? 0 : e;
	}
	function Ud(e, t) {
		return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
	}
	var Wd = null;
	function Gd() {
		var e = window.event;
		return e && e.type === "popstate" ? e === Wd ? !1 : (Wd = e, !0) : (Wd = null, !1);
	}
	var Kd = typeof setTimeout == "function" ? setTimeout : void 0, qd = typeof clearTimeout == "function" ? clearTimeout : void 0, Jd = typeof Promise == "function" ? Promise : void 0, Yd = typeof queueMicrotask == "function" ? queueMicrotask : Jd === void 0 ? Kd : function(e) {
		return Jd.resolve(null).then(e).catch(Xd);
	};
	function Xd(e) {
		setTimeout(function() {
			throw e;
		});
	}
	function Zd(e) {
		return e === "head";
	}
	function Qd(e, t) {
		var n = t, r = 0;
		do {
			var i = n.nextSibling;
			if (e.removeChild(n), i && i.nodeType === 8) if (n = i.data, n === "/$" || n === "/&") {
				if (r === 0) {
					e.removeChild(i), Np(t);
					return;
				}
				r--;
			} else if (n === "$" || n === "$?" || n === "$~" || n === "$!" || n === "&") r++;
			else if (n === "html") pf(e.ownerDocument.documentElement);
			else if (n === "head") {
				n = e.ownerDocument.head, pf(n);
				for (var a = n.firstChild; a;) {
					var o = a.nextSibling, s = a.nodeName;
					a[ht] || s === "SCRIPT" || s === "STYLE" || s === "LINK" && a.rel.toLowerCase() === "stylesheet" || n.removeChild(a), a = o;
				}
			} else n === "body" && pf(e.ownerDocument.body);
			n = i;
		} while (n);
		Np(t);
	}
	function $d(e, t) {
		var n = e;
		e = 0;
		do {
			var r = n.nextSibling;
			if (n.nodeType === 1 ? t ? (n._stashedDisplay = n.style.display, n.style.display = "none") : (n.style.display = n._stashedDisplay || "", n.getAttribute("style") === "" && n.removeAttribute("style")) : n.nodeType === 3 && (t ? (n._stashedText = n.nodeValue, n.nodeValue = "") : n.nodeValue = n._stashedText || ""), r && r.nodeType === 8) if (n = r.data, n === "/$") {
				if (e === 0) break;
				e--;
			} else n !== "$" && n !== "$?" && n !== "$~" && n !== "$!" || e++;
			n = r;
		} while (n);
	}
	function ef(e) {
		var t = e.firstChild;
		for (t && t.nodeType === 10 && (t = t.nextSibling); t;) {
			var n = t;
			switch (t = t.nextSibling, n.nodeName) {
				case "HTML":
				case "HEAD":
				case "BODY":
					ef(n), gt(n);
					continue;
				case "SCRIPT":
				case "STYLE": continue;
				case "LINK": if (n.rel.toLowerCase() === "stylesheet") continue;
			}
			e.removeChild(n);
		}
	}
	function tf(e, t, n, r) {
		for (; e.nodeType === 1;) {
			var i = n;
			if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
				if (!r && (e.nodeName !== "INPUT" || e.type !== "hidden")) break;
			} else if (!r) if (t === "input" && e.type === "hidden") {
				var a = i.name == null ? null : "" + i.name;
				if (i.type === "hidden" && e.getAttribute("name") === a) return e;
			} else return e;
			else if (!e[ht]) switch (t) {
				case "meta":
					if (!e.hasAttribute("itemprop")) break;
					return e;
				case "link":
					if (a = e.getAttribute("rel"), a === "stylesheet" && e.hasAttribute("data-precedence") || a !== i.rel || e.getAttribute("href") !== (i.href == null || i.href === "" ? null : i.href) || e.getAttribute("crossorigin") !== (i.crossOrigin == null ? null : i.crossOrigin) || e.getAttribute("title") !== (i.title == null ? null : i.title)) break;
					return e;
				case "style":
					if (e.hasAttribute("data-precedence")) break;
					return e;
				case "script":
					if (a = e.getAttribute("src"), (a !== (i.src == null ? null : i.src) || e.getAttribute("type") !== (i.type == null ? null : i.type) || e.getAttribute("crossorigin") !== (i.crossOrigin == null ? null : i.crossOrigin)) && a && e.hasAttribute("async") && !e.hasAttribute("itemprop")) break;
					return e;
				default: return e;
			}
			if (e = cf(e.nextSibling), e === null) break;
		}
		return null;
	}
	function nf(e, t, n) {
		if (t === "") return null;
		for (; e.nodeType !== 3;) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !n || (e = cf(e.nextSibling), e === null)) return null;
		return e;
	}
	function rf(e, t) {
		for (; e.nodeType !== 8;) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = cf(e.nextSibling), e === null)) return null;
		return e;
	}
	function af(e) {
		return e.data === "$?" || e.data === "$~";
	}
	function of(e) {
		return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
	}
	function sf(e, t) {
		var n = e.ownerDocument;
		if (e.data === "$~") e._reactRetry = t;
		else if (e.data !== "$?" || n.readyState !== "loading") t();
		else {
			var r = function() {
				t(), n.removeEventListener("DOMContentLoaded", r);
			};
			n.addEventListener("DOMContentLoaded", r), e._reactRetry = r;
		}
	}
	function cf(e) {
		for (; e != null; e = e.nextSibling) {
			var t = e.nodeType;
			if (t === 1 || t === 3) break;
			if (t === 8) {
				if (t = e.data, t === "$" || t === "$!" || t === "$?" || t === "$~" || t === "&" || t === "F!" || t === "F") break;
				if (t === "/$" || t === "/&") return null;
			}
		}
		return e;
	}
	var lf = null;
	function uf(e) {
		e = e.nextSibling;
		for (var t = 0; e;) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (n === "/$" || n === "/&") {
					if (t === 0) return cf(e.nextSibling);
					t--;
				} else n !== "$" && n !== "$!" && n !== "$?" && n !== "$~" && n !== "&" || t++;
			}
			e = e.nextSibling;
		}
		return null;
	}
	function df(e) {
		e = e.previousSibling;
		for (var t = 0; e;) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (n === "$" || n === "$!" || n === "$?" || n === "$~" || n === "&") {
					if (t === 0) return e;
					t--;
				} else n !== "/$" && n !== "/&" || t++;
			}
			e = e.previousSibling;
		}
		return null;
	}
	function ff(e, t, n) {
		switch (t = Bd(n), e) {
			case "html":
				if (e = t.documentElement, !e) throw Error(i(452));
				return e;
			case "head":
				if (e = t.head, !e) throw Error(i(453));
				return e;
			case "body":
				if (e = t.body, !e) throw Error(i(454));
				return e;
			default: throw Error(i(451));
		}
	}
	function pf(e) {
		for (var t = e.attributes; t.length;) e.removeAttributeNode(t[0]);
		gt(e);
	}
	var mf = /* @__PURE__ */ new Map(), hf = /* @__PURE__ */ new Set();
	function gf(e) {
		return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
	}
	var _f = A.d;
	A.d = {
		f: vf,
		r: yf,
		D: Sf,
		C: Cf,
		L: wf,
		m: Tf,
		X: Df,
		S: Ef,
		M: Of
	};
	function vf() {
		var e = _f.f(), t = bu();
		return e || t;
	}
	function yf(e) {
		var t = L(e);
		t !== null && t.tag === 5 && t.type === "form" ? Es(t) : _f.r(e);
	}
	var bf = typeof document > "u" ? null : document;
	function xf(e, t, n) {
		var r = bf;
		if (r && typeof t == "string" && t) {
			var i = Rt(t);
			i = "link[rel=\"" + e + "\"][href=\"" + i + "\"]", typeof n == "string" && (i += "[crossorigin=\"" + n + "\"]"), hf.has(i) || (hf.add(i), e = {
				rel: e,
				crossOrigin: n,
				href: t
			}, r.querySelector(i) === null && (t = r.createElement("link"), Pd(t, "link", e), bt(t), r.head.appendChild(t)));
		}
	}
	function Sf(e) {
		_f.D(e), xf("dns-prefetch", e, null);
	}
	function Cf(e, t) {
		_f.C(e, t), xf("preconnect", e, t);
	}
	function wf(e, t, n) {
		_f.L(e, t, n);
		var r = bf;
		if (r && e && t) {
			var i = "link[rel=\"preload\"][as=\"" + Rt(t) + "\"]";
			t === "image" && n && n.imageSrcSet ? (i += "[imagesrcset=\"" + Rt(n.imageSrcSet) + "\"]", typeof n.imageSizes == "string" && (i += "[imagesizes=\"" + Rt(n.imageSizes) + "\"]")) : i += "[href=\"" + Rt(e) + "\"]";
			var a = i;
			switch (t) {
				case "style":
					a = Af(e);
					break;
				case "script": a = Pf(e);
			}
			mf.has(a) || (e = h({
				rel: "preload",
				href: t === "image" && n && n.imageSrcSet ? void 0 : e,
				as: t
			}, n), mf.set(a, e), r.querySelector(i) !== null || t === "style" && r.querySelector(jf(a)) || t === "script" && r.querySelector(Ff(a)) || (t = r.createElement("link"), Pd(t, "link", e), bt(t), r.head.appendChild(t)));
		}
	}
	function Tf(e, t) {
		_f.m(e, t);
		var n = bf;
		if (n && e) {
			var r = t && typeof t.as == "string" ? t.as : "script", i = "link[rel=\"modulepreload\"][as=\"" + Rt(r) + "\"][href=\"" + Rt(e) + "\"]", a = i;
			switch (r) {
				case "audioworklet":
				case "paintworklet":
				case "serviceworker":
				case "sharedworker":
				case "worker":
				case "script": a = Pf(e);
			}
			if (!mf.has(a) && (e = h({
				rel: "modulepreload",
				href: e
			}, t), mf.set(a, e), n.querySelector(i) === null)) {
				switch (r) {
					case "audioworklet":
					case "paintworklet":
					case "serviceworker":
					case "sharedworker":
					case "worker":
					case "script": if (n.querySelector(Ff(a))) return;
				}
				r = n.createElement("link"), Pd(r, "link", e), bt(r), n.head.appendChild(r);
			}
		}
	}
	function Ef(e, t, n) {
		_f.S(e, t, n);
		var r = bf;
		if (r && e) {
			var i = yt(r).hoistableStyles, a = Af(e);
			t ||= "default";
			var o = i.get(a);
			if (!o) {
				var s = {
					loading: 0,
					preload: null
				};
				if (o = r.querySelector(jf(a))) s.loading = 5;
				else {
					e = h({
						rel: "stylesheet",
						href: e,
						"data-precedence": t
					}, n), (n = mf.get(a)) && Rf(e, n);
					var c = o = r.createElement("link");
					bt(c), Pd(c, "link", e), c._p = new Promise(function(e, t) {
						c.onload = e, c.onerror = t;
					}), c.addEventListener("load", function() {
						s.loading |= 1;
					}), c.addEventListener("error", function() {
						s.loading |= 2;
					}), s.loading |= 4, Lf(o, t, r);
				}
				o = {
					type: "stylesheet",
					instance: o,
					count: 1,
					state: s
				}, i.set(a, o);
			}
		}
	}
	function Df(e, t) {
		_f.X(e, t);
		var n = bf;
		if (n && e) {
			var r = yt(n).hoistableScripts, i = Pf(e), a = r.get(i);
			a || (a = n.querySelector(Ff(i)), a || (e = h({
				src: e,
				async: !0
			}, t), (t = mf.get(i)) && zf(e, t), a = n.createElement("script"), bt(a), Pd(a, "link", e), n.head.appendChild(a)), a = {
				type: "script",
				instance: a,
				count: 1,
				state: null
			}, r.set(i, a));
		}
	}
	function Of(e, t) {
		_f.M(e, t);
		var n = bf;
		if (n && e) {
			var r = yt(n).hoistableScripts, i = Pf(e), a = r.get(i);
			a || (a = n.querySelector(Ff(i)), a || (e = h({
				src: e,
				async: !0,
				type: "module"
			}, t), (t = mf.get(i)) && zf(e, t), a = n.createElement("script"), bt(a), Pd(a, "link", e), n.head.appendChild(a)), a = {
				type: "script",
				instance: a,
				count: 1,
				state: null
			}, r.set(i, a));
		}
	}
	function kf(e, t, n, r) {
		var a = (a = de.current) ? gf(a) : null;
		if (!a) throw Error(i(446));
		switch (e) {
			case "meta":
			case "title": return null;
			case "style": return typeof n.precedence == "string" && typeof n.href == "string" ? (t = Af(n.href), n = yt(a).hoistableStyles, r = n.get(t), r || (r = {
				type: "style",
				instance: null,
				count: 0,
				state: null
			}, n.set(t, r)), r) : {
				type: "void",
				instance: null,
				count: 0,
				state: null
			};
			case "link":
				if (n.rel === "stylesheet" && typeof n.href == "string" && typeof n.precedence == "string") {
					e = Af(n.href);
					var o = yt(a).hoistableStyles, s = o.get(e);
					if (s || (a = a.ownerDocument || a, s = {
						type: "stylesheet",
						instance: null,
						count: 0,
						state: {
							loading: 0,
							preload: null
						}
					}, o.set(e, s), (o = a.querySelector(jf(e))) && !o._p && (s.instance = o, s.state.loading = 5), mf.has(e) || (n = {
						rel: "preload",
						as: "style",
						href: n.href,
						crossOrigin: n.crossOrigin,
						integrity: n.integrity,
						media: n.media,
						hrefLang: n.hrefLang,
						referrerPolicy: n.referrerPolicy
					}, mf.set(e, n), o || Nf(a, e, n, s.state))), t && r === null) throw Error(i(528, ""));
					return s;
				}
				if (t && r !== null) throw Error(i(529, ""));
				return null;
			case "script": return t = n.async, n = n.src, typeof n == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Pf(n), n = yt(a).hoistableScripts, r = n.get(t), r || (r = {
				type: "script",
				instance: null,
				count: 0,
				state: null
			}, n.set(t, r)), r) : {
				type: "void",
				instance: null,
				count: 0,
				state: null
			};
			default: throw Error(i(444, e));
		}
	}
	function Af(e) {
		return "href=\"" + Rt(e) + "\"";
	}
	function jf(e) {
		return "link[rel=\"stylesheet\"][" + e + "]";
	}
	function Mf(e) {
		return h({}, e, {
			"data-precedence": e.precedence,
			precedence: null
		});
	}
	function Nf(e, t, n, r) {
		e.querySelector("link[rel=\"preload\"][as=\"style\"][" + t + "]") ? r.loading = 1 : (t = e.createElement("link"), r.preload = t, t.addEventListener("load", function() {
			return r.loading |= 1;
		}), t.addEventListener("error", function() {
			return r.loading |= 2;
		}), Pd(t, "link", n), bt(t), e.head.appendChild(t));
	}
	function Pf(e) {
		return "[src=\"" + Rt(e) + "\"]";
	}
	function Ff(e) {
		return "script[async]" + e;
	}
	function If(e, t, n) {
		if (t.count++, t.instance === null) switch (t.type) {
			case "style":
				var r = e.querySelector("style[data-href~=\"" + Rt(n.href) + "\"]");
				if (r) return t.instance = r, bt(r), r;
				var a = h({}, n, {
					"data-href": n.href,
					"data-precedence": n.precedence,
					href: null,
					precedence: null
				});
				return r = (e.ownerDocument || e).createElement("style"), bt(r), Pd(r, "style", a), Lf(r, n.precedence, e), t.instance = r;
			case "stylesheet":
				a = Af(n.href);
				var o = e.querySelector(jf(a));
				if (o) return t.state.loading |= 4, t.instance = o, bt(o), o;
				r = Mf(n), (a = mf.get(a)) && Rf(r, a), o = (e.ownerDocument || e).createElement("link"), bt(o);
				var s = o;
				return s._p = new Promise(function(e, t) {
					s.onload = e, s.onerror = t;
				}), Pd(o, "link", r), t.state.loading |= 4, Lf(o, n.precedence, e), t.instance = o;
			case "script": return o = Pf(n.src), (a = e.querySelector(Ff(o))) ? (t.instance = a, bt(a), a) : (r = n, (a = mf.get(o)) && (r = h({}, n), zf(r, a)), e = e.ownerDocument || e, a = e.createElement("script"), bt(a), Pd(a, "link", r), e.head.appendChild(a), t.instance = a);
			case "void": return null;
			default: throw Error(i(443, t.type));
		}
		else t.type === "stylesheet" && !(t.state.loading & 4) && (r = t.instance, t.state.loading |= 4, Lf(r, n.precedence, e));
		return t.instance;
	}
	function Lf(e, t, n) {
		for (var r = n.querySelectorAll("link[rel=\"stylesheet\"][data-precedence],style[data-precedence]"), i = r.length ? r[r.length - 1] : null, a = i, o = 0; o < r.length; o++) {
			var s = r[o];
			if (s.dataset.precedence === t) a = s;
			else if (a !== i) break;
		}
		a ? a.parentNode.insertBefore(e, a.nextSibling) : (t = n.nodeType === 9 ? n.head : n, t.insertBefore(e, t.firstChild));
	}
	function Rf(e, t) {
		e.crossOrigin ??= t.crossOrigin, e.referrerPolicy ??= t.referrerPolicy, e.title ??= t.title;
	}
	function zf(e, t) {
		e.crossOrigin ??= t.crossOrigin, e.referrerPolicy ??= t.referrerPolicy, e.integrity ??= t.integrity;
	}
	var Bf = null;
	function Vf(e, t, n) {
		if (Bf === null) {
			var r = /* @__PURE__ */ new Map(), i = Bf = /* @__PURE__ */ new Map();
			i.set(n, r);
		} else i = Bf, r = i.get(n), r || (r = /* @__PURE__ */ new Map(), i.set(n, r));
		if (r.has(e)) return r;
		for (r.set(e, null), n = n.getElementsByTagName(e), i = 0; i < n.length; i++) {
			var a = n[i];
			if (!(a[ht] || a[lt] || e === "link" && a.getAttribute("rel") === "stylesheet") && a.namespaceURI !== "http://www.w3.org/2000/svg") {
				var o = a.getAttribute(t) || "";
				o = e + o;
				var s = r.get(o);
				s ? s.push(a) : r.set(o, [a]);
			}
		}
		return r;
	}
	function Hf(e, t, n) {
		e = e.ownerDocument || e, e.head.insertBefore(n, t === "title" ? e.querySelector("head > title") : null);
	}
	function Uf(e, t, n) {
		if (n === 1 || t.itemProp != null) return !1;
		switch (e) {
			case "meta":
			case "title": return !0;
			case "style":
				if (typeof t.precedence != "string" || typeof t.href != "string" || t.href === "") break;
				return !0;
			case "link":
				if (typeof t.rel != "string" || typeof t.href != "string" || t.href === "" || t.onLoad || t.onError) break;
				switch (t.rel) {
					case "stylesheet": return e = t.disabled, typeof t.precedence == "string" && e == null;
					default: return !0;
				}
			case "script": if (t.async && typeof t.async != "function" && typeof t.async != "symbol" && !t.onLoad && !t.onError && t.src && typeof t.src == "string") return !0;
		}
		return !1;
	}
	function Wf(e) {
		return !(e.type === "stylesheet" && !(e.state.loading & 3));
	}
	function Gf(e, t, n, r) {
		if (n.type === "stylesheet" && (typeof r.media != "string" || !1 !== matchMedia(r.media).matches) && !(n.state.loading & 4)) {
			if (n.instance === null) {
				var i = Af(r.href), a = t.querySelector(jf(i));
				if (a) {
					t = a._p, typeof t == "object" && t && typeof t.then == "function" && (e.count++, e = Jf.bind(e), t.then(e, e)), n.state.loading |= 4, n.instance = a, bt(a);
					return;
				}
				a = t.ownerDocument || t, r = Mf(r), (i = mf.get(i)) && Rf(r, i), a = a.createElement("link"), bt(a);
				var o = a;
				o._p = new Promise(function(e, t) {
					o.onload = e, o.onerror = t;
				}), Pd(a, "link", r), n.instance = a;
			}
			e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(n, t), (t = n.state.preload) && !(n.state.loading & 3) && (e.count++, n = Jf.bind(e), t.addEventListener("load", n), t.addEventListener("error", n));
		}
	}
	var Kf = 0;
	function qf(e, t) {
		return e.stylesheets && e.count === 0 && Xf(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(n) {
			var r = setTimeout(function() {
				if (e.stylesheets && Xf(e, e.stylesheets), e.unsuspend) {
					var t = e.unsuspend;
					e.unsuspend = null, t();
				}
			}, 6e4 + t);
			0 < e.imgBytes && Kf === 0 && (Kf = 62500 * Ld());
			var i = setTimeout(function() {
				if (e.waitingForImages = !1, e.count === 0 && (e.stylesheets && Xf(e, e.stylesheets), e.unsuspend)) {
					var t = e.unsuspend;
					e.unsuspend = null, t();
				}
			}, (e.imgBytes > Kf ? 50 : 800) + t);
			return e.unsuspend = n, function() {
				e.unsuspend = null, clearTimeout(r), clearTimeout(i);
			};
		} : null;
	}
	function Jf() {
		if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
			if (this.stylesheets) Xf(this, this.stylesheets);
			else if (this.unsuspend) {
				var e = this.unsuspend;
				this.unsuspend = null, e();
			}
		}
	}
	var Yf = null;
	function Xf(e, t) {
		e.stylesheets = null, e.unsuspend !== null && (e.count++, Yf = /* @__PURE__ */ new Map(), t.forEach(Zf, e), Yf = null, Jf.call(e));
	}
	function Zf(e, t) {
		if (!(t.state.loading & 4)) {
			var n = Yf.get(e);
			if (n) var r = n.get(null);
			else {
				n = /* @__PURE__ */ new Map(), Yf.set(e, n);
				for (var i = e.querySelectorAll("link[data-precedence],style[data-precedence]"), a = 0; a < i.length; a++) {
					var o = i[a];
					(o.nodeName === "LINK" || o.getAttribute("media") !== "not all") && (n.set(o.dataset.precedence, o), r = o);
				}
				r && n.set(null, r);
			}
			i = t.instance, o = i.getAttribute("data-precedence"), a = n.get(o) || r, a === r && n.set(null, i), n.set(o, i), this.count++, r = Jf.bind(this), i.addEventListener("load", r), i.addEventListener("error", r), a ? a.parentNode.insertBefore(i, a.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(i, e.firstChild)), t.state.loading |= 4;
		}
	}
	var Qf = {
		$$typeof: C,
		Provider: null,
		Consumer: null,
		_currentValue: se,
		_currentValue2: se,
		_threadCount: 0
	};
	function $f(e, t, n, r, i, a, o, s, c) {
		this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = $e(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = $e(0), this.hiddenUpdates = $e(null), this.identifierPrefix = r, this.onUncaughtError = i, this.onCaughtError = a, this.onRecoverableError = o, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = c, this.incompleteTransitions = /* @__PURE__ */ new Map();
	}
	function ep(e, t, n, r, i, a, o, s, c, l, u, d) {
		return e = new $f(e, t, n, o, c, l, u, d, s), t = 1, !0 === a && (t |= 24), a = z(3, null, null, t), e.current = a, a.stateNode = e, t = oa(), t.refCount++, e.pooledCache = t, t.refCount++, a.memoizedState = {
			element: r,
			isDehydrated: n,
			cache: t
		}, za(a), e;
	}
	function tp(e) {
		return e ? (e = oi, e) : oi;
	}
	function np(e, t, n, r, i, a) {
		i = tp(i), r.context === null ? r.context = i : r.pendingContext = i, r = Va(t), r.payload = { element: n }, a = a === void 0 ? null : a, a !== null && (r.callback = a), n = Ha(e, r, t), n !== null && (hu(n, e, t), Ua(n, e, t));
	}
	function rp(e, t) {
		if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
			var n = e.retryLane;
			e.retryLane = n !== 0 && n < t ? n : t;
		}
	}
	function ip(e, t) {
		rp(e, t), (e = e.alternate) && rp(e, t);
	}
	function ap(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = ri(e, 67108864);
			t !== null && hu(t, e, 67108864), ip(e, 67108864);
		}
	}
	function op(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = pu();
			t = it(t);
			var n = ri(e, t);
			n !== null && hu(n, e, t), ip(e, t);
		}
	}
	var sp = !0;
	function cp(e, t, n, r) {
		var i = k.T;
		k.T = null;
		var a = A.p;
		try {
			A.p = 2, up(e, t, n, r);
		} finally {
			A.p = a, k.T = i;
		}
	}
	function lp(e, t, n, r) {
		var i = k.T;
		k.T = null;
		var a = A.p;
		try {
			A.p = 8, up(e, t, n, r);
		} finally {
			A.p = a, k.T = i;
		}
	}
	function up(e, t, n, r) {
		if (sp) {
			var i = dp(r);
			if (i === null) wd(e, t, r, fp, n), Cp(e, r);
			else if (Tp(i, e, t, n, r)) r.stopPropagation();
			else if (Cp(e, r), t & 4 && -1 < Sp.indexOf(e)) {
				for (; i !== null;) {
					var a = L(i);
					if (a !== null) switch (a.tag) {
						case 3:
							if (a = a.stateNode, a.current.memoizedState.isDehydrated) {
								var o = Je(a.pendingLanes);
								if (o !== 0) {
									var s = a;
									for (s.pendingLanes |= 2, s.entangledLanes |= 2; o;) {
										var c = 1 << 31 - Ve(o);
										s.entanglements[1] |= c, o &= ~c;
									}
									rd(a), !(K & 6) && (tu = ke() + 500, id(0, !1));
								}
							}
							break;
						case 31:
						case 13: s = ri(a, 2), s !== null && hu(s, a, 2), bu(), ip(a, 2);
					}
					if (a = dp(r), a === null && wd(e, t, r, fp, n), a === i) break;
					i = a;
				}
				i !== null && r.stopPropagation();
			} else wd(e, t, r, null, n);
		}
	}
	function dp(e) {
		return e = tn(e), pp(e);
	}
	var fp = null;
	function pp(e) {
		if (fp = null, e = _t(e), e !== null) {
			var t = o(e);
			if (t === null) e = null;
			else {
				var n = t.tag;
				if (n === 13) {
					if (e = s(t), e !== null) return e;
					e = null;
				} else if (n === 31) {
					if (e = c(t), e !== null) return e;
					e = null;
				} else if (n === 3) {
					if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
					e = null;
				} else t !== e && (e = null);
			}
		}
		return fp = e, null;
	}
	function mp(e) {
		switch (e) {
			case "beforetoggle":
			case "cancel":
			case "click":
			case "close":
			case "contextmenu":
			case "copy":
			case "cut":
			case "auxclick":
			case "dblclick":
			case "dragend":
			case "dragstart":
			case "drop":
			case "focusin":
			case "focusout":
			case "input":
			case "invalid":
			case "keydown":
			case "keypress":
			case "keyup":
			case "mousedown":
			case "mouseup":
			case "paste":
			case "pause":
			case "play":
			case "pointercancel":
			case "pointerdown":
			case "pointerup":
			case "ratechange":
			case "reset":
			case "resize":
			case "seeked":
			case "submit":
			case "toggle":
			case "touchcancel":
			case "touchend":
			case "touchstart":
			case "volumechange":
			case "change":
			case "selectionchange":
			case "textInput":
			case "compositionstart":
			case "compositionend":
			case "compositionupdate":
			case "beforeblur":
			case "afterblur":
			case "beforeinput":
			case "blur":
			case "fullscreenchange":
			case "focus":
			case "hashchange":
			case "popstate":
			case "select":
			case "selectstart": return 2;
			case "drag":
			case "dragenter":
			case "dragexit":
			case "dragleave":
			case "dragover":
			case "mousemove":
			case "mouseout":
			case "mouseover":
			case "pointermove":
			case "pointerout":
			case "pointerover":
			case "scroll":
			case "touchmove":
			case "wheel":
			case "mouseenter":
			case "mouseleave":
			case "pointerenter":
			case "pointerleave": return 8;
			case "message": switch (Ae()) {
				case je: return 2;
				case Me: return 8;
				case Ne:
				case Pe: return 32;
				case Fe: return 268435456;
				default: return 32;
			}
			default: return 32;
		}
	}
	var hp = !1, gp = null, _p = null, vp = null, yp = /* @__PURE__ */ new Map(), bp = /* @__PURE__ */ new Map(), xp = [], Sp = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
	function Cp(e, t) {
		switch (e) {
			case "focusin":
			case "focusout":
				gp = null;
				break;
			case "dragenter":
			case "dragleave":
				_p = null;
				break;
			case "mouseover":
			case "mouseout":
				vp = null;
				break;
			case "pointerover":
			case "pointerout":
				yp.delete(t.pointerId);
				break;
			case "gotpointercapture":
			case "lostpointercapture": bp.delete(t.pointerId);
		}
	}
	function wp(e, t, n, r, i, a) {
		return e === null || e.nativeEvent !== a ? (e = {
			blockedOn: t,
			domEventName: n,
			eventSystemFlags: r,
			nativeEvent: a,
			targetContainers: [i]
		}, t !== null && (t = L(t), t !== null && ap(t)), e) : (e.eventSystemFlags |= r, t = e.targetContainers, i !== null && t.indexOf(i) === -1 && t.push(i), e);
	}
	function Tp(e, t, n, r, i) {
		switch (t) {
			case "focusin": return gp = wp(gp, e, t, n, r, i), !0;
			case "dragenter": return _p = wp(_p, e, t, n, r, i), !0;
			case "mouseover": return vp = wp(vp, e, t, n, r, i), !0;
			case "pointerover":
				var a = i.pointerId;
				return yp.set(a, wp(yp.get(a) || null, e, t, n, r, i)), !0;
			case "gotpointercapture": return a = i.pointerId, bp.set(a, wp(bp.get(a) || null, e, t, n, r, i)), !0;
		}
		return !1;
	}
	function Ep(e) {
		var t = _t(e.target);
		if (t !== null) {
			var n = o(t);
			if (n !== null) {
				if (t = n.tag, t === 13) {
					if (t = s(n), t !== null) {
						e.blockedOn = t, st(e.priority, function() {
							op(n);
						});
						return;
					}
				} else if (t === 31) {
					if (t = c(n), t !== null) {
						e.blockedOn = t, st(e.priority, function() {
							op(n);
						});
						return;
					}
				} else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
					e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null;
					return;
				}
			}
		}
		e.blockedOn = null;
	}
	function Dp(e) {
		if (e.blockedOn !== null) return !1;
		for (var t = e.targetContainers; 0 < t.length;) {
			var n = dp(e.nativeEvent);
			if (n === null) {
				n = e.nativeEvent;
				var r = new n.constructor(n.type, n);
				en = r, n.target.dispatchEvent(r), en = null;
			} else return t = L(n), t !== null && ap(t), e.blockedOn = n, !1;
			t.shift();
		}
		return !0;
	}
	function Op(e, t, n) {
		Dp(e) && n.delete(t);
	}
	function kp() {
		hp = !1, gp !== null && Dp(gp) && (gp = null), _p !== null && Dp(_p) && (_p = null), vp !== null && Dp(vp) && (vp = null), yp.forEach(Op), bp.forEach(Op);
	}
	function Ap(e, n) {
		e.blockedOn === n && (e.blockedOn = null, hp || (hp = !0, t.unstable_scheduleCallback(t.unstable_NormalPriority, kp)));
	}
	var jp = null;
	function Mp(e) {
		jp !== e && (jp = e, t.unstable_scheduleCallback(t.unstable_NormalPriority, function() {
			jp === e && (jp = null);
			for (var t = 0; t < e.length; t += 3) {
				var n = e[t], r = e[t + 1], i = e[t + 2];
				if (typeof r != "function") {
					if (pp(r || n) === null) continue;
					break;
				}
				var a = L(n);
				a !== null && (e.splice(t, 3), t -= 3, ws(a, {
					pending: !0,
					data: i,
					method: n.method,
					action: r
				}, r, i));
			}
		}));
	}
	function Np(e) {
		function t(t) {
			return Ap(t, e);
		}
		gp !== null && Ap(gp, e), _p !== null && Ap(_p, e), vp !== null && Ap(vp, e), yp.forEach(t), bp.forEach(t);
		for (var n = 0; n < xp.length; n++) {
			var r = xp[n];
			r.blockedOn === e && (r.blockedOn = null);
		}
		for (; 0 < xp.length && (n = xp[0], n.blockedOn === null);) Ep(n), n.blockedOn === null && xp.shift();
		if (n = (e.ownerDocument || e).$$reactFormReplay, n != null) for (r = 0; r < n.length; r += 3) {
			var i = n[r], a = n[r + 1], o = i[ut] || null;
			if (typeof a == "function") o || Mp(n);
			else if (o) {
				var s = null;
				if (a && a.hasAttribute("formAction")) {
					if (i = a, o = a[ut] || null) s = o.formAction;
					else if (pp(i) !== null) continue;
				} else s = o.action;
				typeof s == "function" ? n[r + 1] = s : (n.splice(r, 3), r -= 3), Mp(n);
			}
		}
	}
	function Pp() {
		function e(e) {
			e.canIntercept && e.info === "react-transition" && e.intercept({
				handler: function() {
					return new Promise(function(e) {
						return i = e;
					});
				},
				focusReset: "manual",
				scroll: "manual"
			});
		}
		function t() {
			i !== null && (i(), i = null), r || setTimeout(n, 20);
		}
		function n() {
			if (!r && !navigation.transition) {
				var e = navigation.currentEntry;
				e && e.url != null && navigation.navigate(e.url, {
					state: e.getState(),
					info: "react-transition",
					history: "replace"
				});
			}
		}
		if (typeof navigation == "object") {
			var r = !1, i = null;
			return navigation.addEventListener("navigate", e), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(n, 100), function() {
				r = !0, navigation.removeEventListener("navigate", e), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), i !== null && (i(), i = null);
			};
		}
	}
	function Fp(e) {
		this._internalRoot = e;
	}
	Ip.prototype.render = Fp.prototype.render = function(e) {
		var t = this._internalRoot;
		if (t === null) throw Error(i(409));
		var n = t.current;
		np(n, pu(), e, t, null, null);
	}, Ip.prototype.unmount = Fp.prototype.unmount = function() {
		var e = this._internalRoot;
		if (e !== null) {
			this._internalRoot = null;
			var t = e.containerInfo;
			np(e.current, 2, null, e, null, null), bu(), t[I] = null;
		}
	};
	function Ip(e) {
		this._internalRoot = e;
	}
	Ip.prototype.unstable_scheduleHydration = function(e) {
		if (e) {
			var t = ot();
			e = {
				blockedOn: null,
				target: e,
				priority: t
			};
			for (var n = 0; n < xp.length && t !== 0 && t < xp[n].priority; n++);
			xp.splice(n, 0, e), n === 0 && Ep(e);
		}
	};
	var Lp = n.version;
	if (Lp !== "19.2.6") throw Error(i(527, Lp, "19.2.6"));
	A.findDOMNode = function(e) {
		var t = e._reactInternals;
		if (t === void 0) throw typeof e.render == "function" ? Error(i(188)) : (e = Object.keys(e).join(","), Error(i(268, e)));
		return e = d(t), e = e === null ? null : p(e), e = e === null ? null : e.stateNode, e;
	};
	var Rp = {
		bundleType: 0,
		version: "19.2.6",
		rendererPackageName: "react-dom",
		currentDispatcherRef: k,
		reconcilerVersion: "19.2.6"
	};
	if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
		var zp = __REACT_DEVTOOLS_GLOBAL_HOOK__;
		if (!zp.isDisabled && zp.supportsFiber) try {
			Re = zp.inject(Rp), ze = zp;
		} catch {}
	}
	e.createRoot = function(e, t) {
		if (!a(e)) throw Error(i(299));
		var n = !1, r = "", o = qs, s = Js, c = Ys;
		return t != null && (!0 === t.unstable_strictMode && (n = !0), t.identifierPrefix !== void 0 && (r = t.identifierPrefix), t.onUncaughtError !== void 0 && (o = t.onUncaughtError), t.onCaughtError !== void 0 && (s = t.onCaughtError), t.onRecoverableError !== void 0 && (c = t.onRecoverableError)), t = ep(e, 1, !1, null, null, n, r, null, o, s, c, Pp), e[I] = t.current, Sd(e), new Fp(t);
	};
})), g = /* @__PURE__ */ o(((e, t) => {
	function n() {
		if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) try {
			__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
		} catch (e) {
			console.error(e);
		}
	}
	n(), t.exports = h();
})), _ = (...e) => e.filter((e, t, n) => !!e && e.trim() !== "" && n.indexOf(e) === t).join(" ").trim(), v = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(), y = (e) => e.replace(/^([A-Z])|[\s-_]+(\w)/g, (e, t, n) => n ? n.toUpperCase() : t.toLowerCase()), b = (e) => {
	let t = y(e);
	return t.charAt(0).toUpperCase() + t.slice(1);
}, x = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round"
}, S = (e) => {
	for (let t in e) if (t.startsWith("aria-") || t === "role" || t === "title") return !0;
	return !1;
}, C = /* @__PURE__ */ c(f(), 1), w = (0, C.createContext)({}), T = () => (0, C.useContext)(w), ee = (0, C.forwardRef)(({ color: e, size: t, strokeWidth: n, absoluteStrokeWidth: r, className: i = "", children: a, iconNode: o, ...s }, c) => {
	let { size: l = 24, strokeWidth: u = 2, absoluteStrokeWidth: d = !1, color: f = "currentColor", className: p = "" } = T() ?? {}, m = r ?? d ? Number(n ?? u) * 24 / Number(t ?? l) : n ?? u;
	return (0, C.createElement)("svg", {
		ref: c,
		...x,
		width: t ?? l ?? x.width,
		height: t ?? l ?? x.height,
		stroke: e ?? f,
		strokeWidth: m,
		className: _("lucide", p, i),
		...!a && !S(s) && { "aria-hidden": "true" },
		...s
	}, [...o.map(([e, t]) => (0, C.createElement)(e, t)), ...Array.isArray(a) ? a : [a]]);
}), E = (e, t) => {
	let n = (0, C.forwardRef)(({ className: n, ...r }, i) => (0, C.createElement)(ee, {
		ref: i,
		iconNode: t,
		className: _(`lucide-${v(b(e))}`, `lucide-${e}`, n),
		...r
	}));
	return n.displayName = b(e), n;
}, D = E("arrow-left", [["path", {
	d: "m12 19-7-7 7-7",
	key: "1l729n"
}], ["path", {
	d: "M19 12H5",
	key: "x3x0zl"
}]]), te = E("arrow-right", [["path", {
	d: "M5 12h14",
	key: "1ays0h"
}], ["path", {
	d: "m12 5 7 7-7 7",
	key: "xquz4c"
}]]), ne = E("bot", [
	["path", {
		d: "M12 8V4H8",
		key: "hb8ula"
	}],
	["rect", {
		width: "16",
		height: "12",
		x: "4",
		y: "8",
		rx: "2",
		key: "enze0r"
	}],
	["path", {
		d: "M2 14h2",
		key: "vft8re"
	}],
	["path", {
		d: "M20 14h2",
		key: "4cs60a"
	}],
	["path", {
		d: "M15 13v2",
		key: "1xurst"
	}],
	["path", {
		d: "M9 13v2",
		key: "rq6x2g"
	}]
]), re = E("check", [["path", {
	d: "M20 6 9 17l-5-5",
	key: "1gmf2c"
}]]), O = E("chevron-down", [["path", {
	d: "m6 9 6 6 6-6",
	key: "qrunsl"
}]]), ie = E("chevron-right", [["path", {
	d: "m9 18 6-6-6-6",
	key: "mthhwq"
}]]), ae = E("circle-check", [["circle", {
	cx: "12",
	cy: "12",
	r: "10",
	key: "1mglay"
}], ["path", {
	d: "m9 12 2 2 4-4",
	key: "dzmm74"
}]]), oe = E("clipboard-check", [
	["rect", {
		width: "8",
		height: "4",
		x: "8",
		y: "2",
		rx: "1",
		ry: "1",
		key: "tgr4d6"
	}],
	["path", {
		d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
		key: "116196"
	}],
	["path", {
		d: "m9 14 2 2 4-4",
		key: "df797q"
	}]
]), k = E("house", [["path", {
	d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
	key: "5wwlr5"
}], ["path", {
	d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
	key: "r6nss1"
}]]), A = E("info", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "10",
		key: "1mglay"
	}],
	["path", {
		d: "M12 16v-4",
		key: "1dtifu"
	}],
	["path", {
		d: "M12 8h.01",
		key: "e9boi3"
	}]
]), se = E("loader-circle", [["path", {
	d: "M21 12a9 9 0 1 1-6.219-8.56",
	key: "13zald"
}]]), ce = E("rotate-ccw-clock", [
	["path", {
		d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
		key: "1357e3"
	}],
	["path", {
		d: "M3 3v5h5",
		key: "1xhq8a"
	}],
	["path", {
		d: "M12 7v5l4 2",
		key: "1fdv2h"
	}]
]), le = E("rotate-ccw", [["path", {
	d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
	key: "1357e3"
}], ["path", {
	d: "M3 3v5h5",
	key: "1xhq8a"
}]]), j = E("trending-up", [["path", {
	d: "M16 7h6v6",
	key: "box55l"
}], ["path", {
	d: "m22 7-8.5 8.5-5-5L2 17",
	key: "1t1m79"
}]]), M = E("user-round", [["circle", {
	cx: "12",
	cy: "8",
	r: "5",
	key: "1hypcn"
}], ["path", {
	d: "M20 21a8 8 0 0 0-16 0",
	key: "rfgkzh"
}]]), N = g();
function ue(e) {
	var t, n, r = "";
	if (typeof e == "string" || typeof e == "number") r += e;
	else if (typeof e == "object") if (Array.isArray(e)) {
		var i = e.length;
		for (t = 0; t < i; t++) e[t] && (n = ue(e[t])) && (r && (r += " "), r += n);
	} else for (n in e) e[n] && (r && (r += " "), r += n);
	return r;
}
function P() {
	for (var e, t, n = 0, r = "", i = arguments.length; n < i; n++) (e = arguments[n]) && (t = ue(e)) && (r && (r += " "), r += t);
	return r;
}
//#endregion
//#region node_modules/tailwind-merge/dist/bundle-mjs.mjs
var de = (e, t) => {
	let n = Array(e.length + t.length);
	for (let t = 0; t < e.length; t++) n[t] = e[t];
	for (let r = 0; r < t.length; r++) n[e.length + r] = t[r];
	return n;
}, fe = (e, t) => ({
	classGroupId: e,
	validator: t
}), pe = (e = /* @__PURE__ */ new Map(), t = null, n) => ({
	nextPart: e,
	validators: t,
	classGroupId: n
}), me = "-", he = [], ge = "arbitrary..", _e = (e) => {
	let t = be(e), { conflictingClassGroups: n, conflictingClassGroupModifiers: r } = e;
	return {
		getClassGroupId: (e) => {
			if (e.startsWith("[") && e.endsWith("]")) return ye(e);
			let n = e.split(me);
			return ve(n, +(n[0] === "" && n.length > 1), t);
		},
		getConflictingClassGroupIds: (e, t) => {
			if (t) {
				let t = r[e], i = n[e];
				return t ? i ? de(i, t) : t : i || he;
			}
			return n[e] || he;
		}
	};
}, ve = (e, t, n) => {
	if (e.length - t === 0) return n.classGroupId;
	let r = e[t], i = n.nextPart.get(r);
	if (i) {
		let n = ve(e, t + 1, i);
		if (n) return n;
	}
	let a = n.validators;
	if (a === null) return;
	let o = t === 0 ? e.join(me) : e.slice(t).join(me), s = a.length;
	for (let e = 0; e < s; e++) {
		let t = a[e];
		if (t.validator(o)) return t.classGroupId;
	}
}, ye = (e) => e.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
	let t = e.slice(1, -1), n = t.indexOf(":"), r = t.slice(0, n);
	return r ? ge + r : void 0;
})(), be = (e) => {
	let { theme: t, classGroups: n } = e;
	return xe(n, t);
}, xe = (e, t) => {
	let n = pe();
	for (let r in e) {
		let i = e[r];
		Se(i, n, r, t);
	}
	return n;
}, Se = (e, t, n, r) => {
	let i = e.length;
	for (let a = 0; a < i; a++) {
		let i = e[a];
		Ce(i, t, n, r);
	}
}, Ce = (e, t, n, r) => {
	if (typeof e == "string") {
		we(e, t, n);
		return;
	}
	if (typeof e == "function") {
		Te(e, t, n, r);
		return;
	}
	Ee(e, t, n, r);
}, we = (e, t, n) => {
	let r = e === "" ? t : De(t, e);
	r.classGroupId = n;
}, Te = (e, t, n, r) => {
	if (Oe(e)) {
		Se(e(r), t, n, r);
		return;
	}
	t.validators === null && (t.validators = []), t.validators.push(fe(n, e));
}, Ee = (e, t, n, r) => {
	let i = Object.entries(e), a = i.length;
	for (let e = 0; e < a; e++) {
		let [a, o] = i[e];
		Se(o, De(t, a), n, r);
	}
}, De = (e, t) => {
	let n = e, r = t.split(me), i = r.length;
	for (let e = 0; e < i; e++) {
		let t = r[e], i = n.nextPart.get(t);
		i || (i = pe(), n.nextPart.set(t, i)), n = i;
	}
	return n;
}, Oe = (e) => "isThemeGetter" in e && e.isThemeGetter === !0, ke = (e) => {
	if (e < 1) return {
		get: () => void 0,
		set: () => {}
	};
	let t = 0, n = Object.create(null), r = Object.create(null), i = (i, a) => {
		n[i] = a, t++, t > e && (t = 0, r = n, n = Object.create(null));
	};
	return {
		get(e) {
			let t = n[e];
			if (t !== void 0) return t;
			if ((t = r[e]) !== void 0) return i(e, t), t;
		},
		set(e, t) {
			e in n ? n[e] = t : i(e, t);
		}
	};
}, Ae = "!", je = ":", Me = [], Ne = (e, t, n, r, i) => ({
	modifiers: e,
	hasImportantModifier: t,
	baseClassName: n,
	maybePostfixModifierPosition: r,
	isExternal: i
}), Pe = (e) => {
	let { prefix: t, experimentalParseClassName: n } = e, r = (e) => {
		let t = [], n = 0, r = 0, i = 0, a, o = e.length;
		for (let s = 0; s < o; s++) {
			let o = e[s];
			if (n === 0 && r === 0) {
				if (o === je) {
					t.push(e.slice(i, s)), i = s + 1;
					continue;
				}
				if (o === "/") {
					a = s;
					continue;
				}
			}
			o === "[" ? n++ : o === "]" ? n-- : o === "(" ? r++ : o === ")" && r--;
		}
		let s = t.length === 0 ? e : e.slice(i), c = s, l = !1;
		s.endsWith(Ae) ? (c = s.slice(0, -1), l = !0) : s.startsWith(Ae) && (c = s.slice(1), l = !0);
		let u = a && a > i ? a - i : void 0;
		return Ne(t, l, c, u);
	};
	if (t) {
		let e = t + je, n = r;
		r = (t) => t.startsWith(e) ? n(t.slice(e.length)) : Ne(Me, !1, t, void 0, !0);
	}
	if (n) {
		let e = r;
		r = (t) => n({
			className: t,
			parseClassName: e
		});
	}
	return r;
}, Fe = (e) => {
	let t = /* @__PURE__ */ new Map();
	return e.orderSensitiveModifiers.forEach((e, n) => {
		t.set(e, 1e6 + n);
	}), (e) => {
		let n = [], r = [];
		for (let i = 0; i < e.length; i++) {
			let a = e[i], o = a[0] === "[", s = t.has(a);
			o || s ? (r.length > 0 && (r.sort(), n.push(...r), r = []), n.push(a)) : r.push(a);
		}
		return r.length > 0 && (r.sort(), n.push(...r)), n;
	};
}, Ie = (e) => ({
	cache: ke(e.cacheSize),
	parseClassName: Pe(e),
	sortModifiers: Fe(e),
	postfixLookupClassGroupIds: Le(e),
	..._e(e)
}), Le = (e) => {
	let t = Object.create(null), n = e.postfixLookupClassGroups;
	if (n) for (let e = 0; e < n.length; e++) t[n[e]] = !0;
	return t;
}, Re = /\s+/, ze = (e, t) => {
	let { parseClassName: n, getClassGroupId: r, getConflictingClassGroupIds: i, sortModifiers: a, postfixLookupClassGroupIds: o } = t, s = [], c = e.trim().split(Re), l = "";
	for (let e = c.length - 1; e >= 0; --e) {
		let t = c[e], { isExternal: u, modifiers: d, hasImportantModifier: f, baseClassName: p, maybePostfixModifierPosition: m } = n(t);
		if (u) {
			l = t + (l.length > 0 ? " " + l : l);
			continue;
		}
		let h = !!m, g;
		if (h) {
			g = r(p.substring(0, m));
			let e = g && o[g] ? r(p) : void 0;
			e && e !== g && (g = e, h = !1);
		} else g = r(p);
		if (!g) {
			if (!h) {
				l = t + (l.length > 0 ? " " + l : l);
				continue;
			}
			if (g = r(p), !g) {
				l = t + (l.length > 0 ? " " + l : l);
				continue;
			}
			h = !1;
		}
		let _ = d.length === 0 ? "" : d.length === 1 ? d[0] : a(d).join(":"), v = f ? _ + Ae : _, y = v + g;
		if (s.indexOf(y) > -1) continue;
		s.push(y);
		let b = i(g, h);
		for (let e = 0; e < b.length; ++e) {
			let t = b[e];
			s.push(v + t);
		}
		l = t + (l.length > 0 ? " " + l : l);
	}
	return l;
}, Be = (...e) => {
	let t = 0, n, r, i = "";
	for (; t < e.length;) (n = e[t++]) && (r = Ve(n)) && (i && (i += " "), i += r);
	return i;
}, Ve = (e) => {
	if (typeof e == "string") return e;
	let t, n = "";
	for (let r = 0; r < e.length; r++) e[r] && (t = Ve(e[r])) && (n && (n += " "), n += t);
	return n;
}, He = (e, ...t) => {
	let n, r, i, a, o = (o) => (n = Ie(t.reduce((e, t) => t(e), e())), r = n.cache.get, i = n.cache.set, a = s, s(o)), s = (e) => {
		let t = r(e);
		if (t) return t;
		let a = ze(e, n);
		return i(e, a), a;
	};
	return a = o, (...e) => a(Be(...e));
}, Ue = [], We = (e) => {
	let t = (t) => t[e] || Ue;
	return t.isThemeGetter = !0, t;
}, Ge = /^\[(?:(\w[\w-]*):)?(.+)\]$/i, Ke = /^\((?:(\w[\w-]*):)?(.+)\)$/i, qe = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/, Je = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/, Ye = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/, Xe = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/, Ze = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/, Qe = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/, $e = (e) => qe.test(e), F = (e) => !!e && !Number.isNaN(Number(e)), et = (e) => !!e && Number.isInteger(Number(e)), tt = (e) => e.endsWith("%") && F(e.slice(0, -1)), nt = (e) => Je.test(e), rt = () => !0, it = (e) => Ye.test(e) && !Xe.test(e), at = () => !1, ot = (e) => Ze.test(e), st = (e) => Qe.test(e), ct = (e) => !I(e) && !L(e), lt = (e) => e.startsWith("@container") && (e[10] === "/" && e[11] !== void 0 || e[11] === "s" && e[16] !== void 0 && e.startsWith("-size/", 10) || e[11] === "n" && e[18] !== void 0 && e.startsWith("-normal/", 10)), ut = (e) => Tt(e, kt, at), I = (e) => Ge.test(e), dt = (e) => Tt(e, At, it), ft = (e) => Tt(e, jt, F), pt = (e) => Tt(e, Nt, rt), mt = (e) => Tt(e, Mt, at), ht = (e) => Tt(e, Dt, at), gt = (e) => Tt(e, Ot, st), _t = (e) => Tt(e, Pt, ot), L = (e) => Ke.test(e), vt = (e) => Et(e, At), yt = (e) => Et(e, Mt), bt = (e) => Et(e, Dt), xt = (e) => Et(e, kt), St = (e) => Et(e, Ot), Ct = (e) => Et(e, Pt, !0), wt = (e) => Et(e, Nt, !0), Tt = (e, t, n) => {
	let r = Ge.exec(e);
	return r ? r[1] ? t(r[1]) : n(r[2]) : !1;
}, Et = (e, t, n = !1) => {
	let r = Ke.exec(e);
	return r ? r[1] ? t(r[1]) : n : !1;
}, Dt = (e) => e === "position" || e === "percentage", Ot = (e) => e === "image" || e === "url", kt = (e) => e === "length" || e === "size" || e === "bg-size", At = (e) => e === "length", jt = (e) => e === "number", Mt = (e) => e === "family-name", Nt = (e) => e === "number" || e === "weight", Pt = (e) => e === "shadow", Ft = /* @__PURE__ */ He(() => {
	let e = We("color"), t = We("font"), n = We("text"), r = We("font-weight"), i = We("tracking"), a = We("leading"), o = We("breakpoint"), s = We("container"), c = We("spacing"), l = We("radius"), u = We("shadow"), d = We("inset-shadow"), f = We("text-shadow"), p = We("drop-shadow"), m = We("blur"), h = We("perspective"), g = We("aspect"), _ = We("ease"), v = We("animate"), y = () => [
		"auto",
		"avoid",
		"all",
		"avoid-page",
		"page",
		"left",
		"right",
		"column"
	], b = () => [
		"center",
		"top",
		"bottom",
		"left",
		"right",
		"top-left",
		"left-top",
		"top-right",
		"right-top",
		"bottom-right",
		"right-bottom",
		"bottom-left",
		"left-bottom"
	], x = () => [
		...b(),
		L,
		I
	], S = () => [
		"auto",
		"hidden",
		"clip",
		"visible",
		"scroll"
	], C = () => [
		"auto",
		"contain",
		"none"
	], w = () => [
		L,
		I,
		c
	], T = () => [
		$e,
		"full",
		"auto",
		...w()
	], ee = () => [
		et,
		"none",
		"subgrid",
		L,
		I
	], E = () => [
		"auto",
		{ span: [
			"full",
			et,
			L,
			I
		] },
		et,
		L,
		I
	], D = () => [
		et,
		"auto",
		L,
		I
	], te = () => [
		"auto",
		"min",
		"max",
		"fr",
		L,
		I
	], ne = () => [
		"start",
		"end",
		"center",
		"between",
		"around",
		"evenly",
		"stretch",
		"baseline",
		"center-safe",
		"end-safe"
	], re = () => [
		"start",
		"end",
		"center",
		"stretch",
		"center-safe",
		"end-safe"
	], O = () => ["auto", ...w()], ie = () => [
		$e,
		"auto",
		"full",
		"dvw",
		"dvh",
		"lvw",
		"lvh",
		"svw",
		"svh",
		"min",
		"max",
		"fit",
		...w()
	], ae = () => [
		$e,
		"screen",
		"full",
		"dvw",
		"lvw",
		"svw",
		"min",
		"max",
		"fit",
		...w()
	], oe = () => [
		$e,
		"screen",
		"full",
		"lh",
		"dvh",
		"lvh",
		"svh",
		"min",
		"max",
		"fit",
		...w()
	], k = () => [
		e,
		L,
		I
	], A = () => [
		...b(),
		bt,
		ht,
		{ position: [L, I] }
	], se = () => ["no-repeat", { repeat: [
		"",
		"x",
		"y",
		"space",
		"round"
	] }], ce = () => [
		"auto",
		"cover",
		"contain",
		xt,
		ut,
		{ size: [L, I] }
	], le = () => [
		tt,
		vt,
		dt
	], j = () => [
		"",
		"none",
		"full",
		l,
		L,
		I
	], M = () => [
		"",
		F,
		vt,
		dt
	], N = () => [
		"solid",
		"dashed",
		"dotted",
		"double"
	], ue = () => [
		"normal",
		"multiply",
		"screen",
		"overlay",
		"darken",
		"lighten",
		"color-dodge",
		"color-burn",
		"hard-light",
		"soft-light",
		"difference",
		"exclusion",
		"hue",
		"saturation",
		"color",
		"luminosity"
	], P = () => [
		F,
		tt,
		bt,
		ht
	], de = () => [
		"",
		"none",
		m,
		L,
		I
	], fe = () => [
		"none",
		F,
		L,
		I
	], pe = () => [
		"none",
		F,
		L,
		I
	], me = () => [
		F,
		L,
		I
	], he = () => [
		$e,
		"full",
		...w()
	];
	return {
		cacheSize: 500,
		theme: {
			animate: [
				"spin",
				"ping",
				"pulse",
				"bounce"
			],
			aspect: ["video"],
			blur: [nt],
			breakpoint: [nt],
			color: [rt],
			container: [nt],
			"drop-shadow": [nt],
			ease: [
				"in",
				"out",
				"in-out"
			],
			font: [ct],
			"font-weight": [
				"thin",
				"extralight",
				"light",
				"normal",
				"medium",
				"semibold",
				"bold",
				"extrabold",
				"black"
			],
			"inset-shadow": [nt],
			leading: [
				"none",
				"tight",
				"snug",
				"normal",
				"relaxed",
				"loose"
			],
			perspective: [
				"dramatic",
				"near",
				"normal",
				"midrange",
				"distant",
				"none"
			],
			radius: [nt],
			shadow: [nt],
			spacing: ["px", F],
			text: [nt],
			"text-shadow": [nt],
			tracking: [
				"tighter",
				"tight",
				"normal",
				"wide",
				"wider",
				"widest"
			]
		},
		classGroups: {
			aspect: [{ aspect: [
				"auto",
				"square",
				$e,
				I,
				L,
				g
			] }],
			container: ["container"],
			"container-type": [{ "@container": [
				"",
				"normal",
				"size",
				L,
				I
			] }],
			"container-named": [lt],
			columns: [{ columns: [
				F,
				I,
				L,
				s
			] }],
			"break-after": [{ "break-after": y() }],
			"break-before": [{ "break-before": y() }],
			"break-inside": [{ "break-inside": [
				"auto",
				"avoid",
				"avoid-page",
				"avoid-column"
			] }],
			"box-decoration": [{ "box-decoration": ["slice", "clone"] }],
			box: [{ box: ["border", "content"] }],
			display: [
				"block",
				"inline-block",
				"inline",
				"flex",
				"inline-flex",
				"table",
				"inline-table",
				"table-caption",
				"table-cell",
				"table-column",
				"table-column-group",
				"table-footer-group",
				"table-header-group",
				"table-row-group",
				"table-row",
				"flow-root",
				"grid",
				"inline-grid",
				"contents",
				"list-item",
				"hidden"
			],
			sr: ["sr-only", "not-sr-only"],
			float: [{ float: [
				"right",
				"left",
				"none",
				"start",
				"end"
			] }],
			clear: [{ clear: [
				"left",
				"right",
				"both",
				"none",
				"start",
				"end"
			] }],
			isolation: ["isolate", "isolation-auto"],
			"object-fit": [{ object: [
				"contain",
				"cover",
				"fill",
				"none",
				"scale-down"
			] }],
			"object-position": [{ object: x() }],
			overflow: [{ overflow: S() }],
			"overflow-x": [{ "overflow-x": S() }],
			"overflow-y": [{ "overflow-y": S() }],
			overscroll: [{ overscroll: C() }],
			"overscroll-x": [{ "overscroll-x": C() }],
			"overscroll-y": [{ "overscroll-y": C() }],
			position: [
				"static",
				"fixed",
				"absolute",
				"relative",
				"sticky"
			],
			inset: [{ inset: T() }],
			"inset-x": [{ "inset-x": T() }],
			"inset-y": [{ "inset-y": T() }],
			start: [{
				"inset-s": T(),
				start: T()
			}],
			end: [{
				"inset-e": T(),
				end: T()
			}],
			"inset-bs": [{ "inset-bs": T() }],
			"inset-be": [{ "inset-be": T() }],
			top: [{ top: T() }],
			right: [{ right: T() }],
			bottom: [{ bottom: T() }],
			left: [{ left: T() }],
			visibility: [
				"visible",
				"invisible",
				"collapse"
			],
			z: [{ z: [
				et,
				"auto",
				L,
				I
			] }],
			basis: [{ basis: [
				$e,
				"full",
				"auto",
				s,
				...w()
			] }],
			"flex-direction": [{ flex: [
				"row",
				"row-reverse",
				"col",
				"col-reverse"
			] }],
			"flex-wrap": [{ flex: [
				"nowrap",
				"wrap",
				"wrap-reverse"
			] }],
			flex: [{ flex: [
				F,
				$e,
				"auto",
				"initial",
				"none",
				I
			] }],
			grow: [{ grow: [
				"",
				F,
				L,
				I
			] }],
			shrink: [{ shrink: [
				"",
				F,
				L,
				I
			] }],
			order: [{ order: [
				et,
				"first",
				"last",
				"none",
				L,
				I
			] }],
			"grid-cols": [{ "grid-cols": ee() }],
			"col-start-end": [{ col: E() }],
			"col-start": [{ "col-start": D() }],
			"col-end": [{ "col-end": D() }],
			"grid-rows": [{ "grid-rows": ee() }],
			"row-start-end": [{ row: E() }],
			"row-start": [{ "row-start": D() }],
			"row-end": [{ "row-end": D() }],
			"grid-flow": [{ "grid-flow": [
				"row",
				"col",
				"dense",
				"row-dense",
				"col-dense"
			] }],
			"auto-cols": [{ "auto-cols": te() }],
			"auto-rows": [{ "auto-rows": te() }],
			gap: [{ gap: w() }],
			"gap-x": [{ "gap-x": w() }],
			"gap-y": [{ "gap-y": w() }],
			"justify-content": [{ justify: [...ne(), "normal"] }],
			"justify-items": [{ "justify-items": [...re(), "normal"] }],
			"justify-self": [{ "justify-self": ["auto", ...re()] }],
			"align-content": [{ content: ["normal", ...ne()] }],
			"align-items": [{ items: [...re(), { baseline: ["", "last"] }] }],
			"align-self": [{ self: [
				"auto",
				...re(),
				{ baseline: ["", "last"] }
			] }],
			"place-content": [{ "place-content": ne() }],
			"place-items": [{ "place-items": [...re(), "baseline"] }],
			"place-self": [{ "place-self": ["auto", ...re()] }],
			p: [{ p: w() }],
			px: [{ px: w() }],
			py: [{ py: w() }],
			ps: [{ ps: w() }],
			pe: [{ pe: w() }],
			pbs: [{ pbs: w() }],
			pbe: [{ pbe: w() }],
			pt: [{ pt: w() }],
			pr: [{ pr: w() }],
			pb: [{ pb: w() }],
			pl: [{ pl: w() }],
			m: [{ m: O() }],
			mx: [{ mx: O() }],
			my: [{ my: O() }],
			ms: [{ ms: O() }],
			me: [{ me: O() }],
			mbs: [{ mbs: O() }],
			mbe: [{ mbe: O() }],
			mt: [{ mt: O() }],
			mr: [{ mr: O() }],
			mb: [{ mb: O() }],
			ml: [{ ml: O() }],
			"space-x": [{ "space-x": w() }],
			"space-x-reverse": ["space-x-reverse"],
			"space-y": [{ "space-y": w() }],
			"space-y-reverse": ["space-y-reverse"],
			size: [{ size: ie() }],
			"inline-size": [{ inline: ["auto", ...ae()] }],
			"min-inline-size": [{ "min-inline": ["auto", ...ae()] }],
			"max-inline-size": [{ "max-inline": ["none", ...ae()] }],
			"block-size": [{ block: ["auto", ...oe()] }],
			"min-block-size": [{ "min-block": ["auto", ...oe()] }],
			"max-block-size": [{ "max-block": ["none", ...oe()] }],
			w: [{ w: [
				s,
				"screen",
				...ie()
			] }],
			"min-w": [{ "min-w": [
				s,
				"screen",
				"none",
				...ie()
			] }],
			"max-w": [{ "max-w": [
				s,
				"screen",
				"none",
				"prose",
				{ screen: [o] },
				...ie()
			] }],
			h: [{ h: [
				"screen",
				"lh",
				...ie()
			] }],
			"min-h": [{ "min-h": [
				"screen",
				"lh",
				"none",
				...ie()
			] }],
			"max-h": [{ "max-h": [
				"screen",
				"lh",
				...ie()
			] }],
			"font-size": [{ text: [
				"base",
				n,
				vt,
				dt
			] }],
			"font-smoothing": ["antialiased", "subpixel-antialiased"],
			"font-style": ["italic", "not-italic"],
			"font-weight": [{ font: [
				r,
				wt,
				pt
			] }],
			"font-stretch": [{ "font-stretch": [
				"ultra-condensed",
				"extra-condensed",
				"condensed",
				"semi-condensed",
				"normal",
				"semi-expanded",
				"expanded",
				"extra-expanded",
				"ultra-expanded",
				tt,
				I
			] }],
			"font-family": [{ font: [
				yt,
				mt,
				t
			] }],
			"font-features": [{ "font-features": [I] }],
			"fvn-normal": ["normal-nums"],
			"fvn-ordinal": ["ordinal"],
			"fvn-slashed-zero": ["slashed-zero"],
			"fvn-figure": ["lining-nums", "oldstyle-nums"],
			"fvn-spacing": ["proportional-nums", "tabular-nums"],
			"fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
			tracking: [{ tracking: [
				i,
				L,
				I
			] }],
			"line-clamp": [{ "line-clamp": [
				F,
				"none",
				L,
				ft
			] }],
			leading: [{ leading: [a, ...w()] }],
			"list-image": [{ "list-image": [
				"none",
				L,
				I
			] }],
			"list-style-position": [{ list: ["inside", "outside"] }],
			"list-style-type": [{ list: [
				"disc",
				"decimal",
				"none",
				L,
				I
			] }],
			"text-alignment": [{ text: [
				"left",
				"center",
				"right",
				"justify",
				"start",
				"end"
			] }],
			"placeholder-color": [{ placeholder: k() }],
			"text-color": [{ text: k() }],
			"text-decoration": [
				"underline",
				"overline",
				"line-through",
				"no-underline"
			],
			"text-decoration-style": [{ decoration: [...N(), "wavy"] }],
			"text-decoration-thickness": [{ decoration: [
				F,
				"from-font",
				"auto",
				L,
				dt
			] }],
			"text-decoration-color": [{ decoration: k() }],
			"underline-offset": [{ "underline-offset": [
				F,
				"auto",
				L,
				I
			] }],
			"text-transform": [
				"uppercase",
				"lowercase",
				"capitalize",
				"normal-case"
			],
			"text-overflow": [
				"truncate",
				"text-ellipsis",
				"text-clip"
			],
			"text-wrap": [{ text: [
				"wrap",
				"nowrap",
				"balance",
				"pretty"
			] }],
			indent: [{ indent: w() }],
			"tab-size": [{ tab: [
				et,
				L,
				I
			] }],
			"vertical-align": [{ align: [
				"baseline",
				"top",
				"middle",
				"bottom",
				"text-top",
				"text-bottom",
				"sub",
				"super",
				L,
				I
			] }],
			whitespace: [{ whitespace: [
				"normal",
				"nowrap",
				"pre",
				"pre-line",
				"pre-wrap",
				"break-spaces"
			] }],
			break: [{ break: [
				"normal",
				"words",
				"all",
				"keep"
			] }],
			wrap: [{ wrap: [
				"break-word",
				"anywhere",
				"normal"
			] }],
			hyphens: [{ hyphens: [
				"none",
				"manual",
				"auto"
			] }],
			content: [{ content: [
				"none",
				L,
				I
			] }],
			"bg-attachment": [{ bg: [
				"fixed",
				"local",
				"scroll"
			] }],
			"bg-clip": [{ "bg-clip": [
				"border",
				"padding",
				"content",
				"text"
			] }],
			"bg-origin": [{ "bg-origin": [
				"border",
				"padding",
				"content"
			] }],
			"bg-position": [{ bg: A() }],
			"bg-repeat": [{ bg: se() }],
			"bg-size": [{ bg: ce() }],
			"bg-image": [{ bg: [
				"none",
				{
					linear: [
						{ to: [
							"t",
							"tr",
							"r",
							"br",
							"b",
							"bl",
							"l",
							"tl"
						] },
						et,
						L,
						I
					],
					radial: [
						"",
						L,
						I
					],
					conic: [
						et,
						L,
						I
					]
				},
				St,
				gt
			] }],
			"bg-color": [{ bg: k() }],
			"gradient-from-pos": [{ from: le() }],
			"gradient-via-pos": [{ via: le() }],
			"gradient-to-pos": [{ to: le() }],
			"gradient-from": [{ from: k() }],
			"gradient-via": [{ via: k() }],
			"gradient-to": [{ to: k() }],
			rounded: [{ rounded: j() }],
			"rounded-s": [{ "rounded-s": j() }],
			"rounded-e": [{ "rounded-e": j() }],
			"rounded-t": [{ "rounded-t": j() }],
			"rounded-r": [{ "rounded-r": j() }],
			"rounded-b": [{ "rounded-b": j() }],
			"rounded-l": [{ "rounded-l": j() }],
			"rounded-ss": [{ "rounded-ss": j() }],
			"rounded-se": [{ "rounded-se": j() }],
			"rounded-ee": [{ "rounded-ee": j() }],
			"rounded-es": [{ "rounded-es": j() }],
			"rounded-tl": [{ "rounded-tl": j() }],
			"rounded-tr": [{ "rounded-tr": j() }],
			"rounded-br": [{ "rounded-br": j() }],
			"rounded-bl": [{ "rounded-bl": j() }],
			"border-w": [{ border: M() }],
			"border-w-x": [{ "border-x": M() }],
			"border-w-y": [{ "border-y": M() }],
			"border-w-s": [{ "border-s": M() }],
			"border-w-e": [{ "border-e": M() }],
			"border-w-bs": [{ "border-bs": M() }],
			"border-w-be": [{ "border-be": M() }],
			"border-w-t": [{ "border-t": M() }],
			"border-w-r": [{ "border-r": M() }],
			"border-w-b": [{ "border-b": M() }],
			"border-w-l": [{ "border-l": M() }],
			"divide-x": [{ "divide-x": M() }],
			"divide-x-reverse": ["divide-x-reverse"],
			"divide-y": [{ "divide-y": M() }],
			"divide-y-reverse": ["divide-y-reverse"],
			"border-style": [{ border: [
				...N(),
				"hidden",
				"none"
			] }],
			"divide-style": [{ divide: [
				...N(),
				"hidden",
				"none"
			] }],
			"border-color": [{ border: k() }],
			"border-color-x": [{ "border-x": k() }],
			"border-color-y": [{ "border-y": k() }],
			"border-color-s": [{ "border-s": k() }],
			"border-color-e": [{ "border-e": k() }],
			"border-color-bs": [{ "border-bs": k() }],
			"border-color-be": [{ "border-be": k() }],
			"border-color-t": [{ "border-t": k() }],
			"border-color-r": [{ "border-r": k() }],
			"border-color-b": [{ "border-b": k() }],
			"border-color-l": [{ "border-l": k() }],
			"divide-color": [{ divide: k() }],
			"outline-style": [{ outline: [
				...N(),
				"none",
				"hidden"
			] }],
			"outline-offset": [{ "outline-offset": [
				F,
				L,
				I
			] }],
			"outline-w": [{ outline: [
				"",
				F,
				vt,
				dt
			] }],
			"outline-color": [{ outline: k() }],
			shadow: [{ shadow: [
				"",
				"none",
				u,
				Ct,
				_t
			] }],
			"shadow-color": [{ shadow: k() }],
			"inset-shadow": [{ "inset-shadow": [
				"none",
				d,
				Ct,
				_t
			] }],
			"inset-shadow-color": [{ "inset-shadow": k() }],
			"ring-w": [{ ring: M() }],
			"ring-w-inset": ["ring-inset"],
			"ring-color": [{ ring: k() }],
			"ring-offset-w": [{ "ring-offset": [F, dt] }],
			"ring-offset-color": [{ "ring-offset": k() }],
			"inset-ring-w": [{ "inset-ring": M() }],
			"inset-ring-color": [{ "inset-ring": k() }],
			"text-shadow": [{ "text-shadow": [
				"none",
				f,
				Ct,
				_t
			] }],
			"text-shadow-color": [{ "text-shadow": k() }],
			opacity: [{ opacity: [
				F,
				L,
				I
			] }],
			"mix-blend": [{ "mix-blend": [
				...ue(),
				"plus-darker",
				"plus-lighter"
			] }],
			"bg-blend": [{ "bg-blend": ue() }],
			"mask-clip": [{ "mask-clip": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }, "mask-no-clip"],
			"mask-composite": [{ mask: [
				"add",
				"subtract",
				"intersect",
				"exclude"
			] }],
			"mask-image-linear-pos": [{ "mask-linear": [F] }],
			"mask-image-linear-from-pos": [{ "mask-linear-from": P() }],
			"mask-image-linear-to-pos": [{ "mask-linear-to": P() }],
			"mask-image-linear-from-color": [{ "mask-linear-from": k() }],
			"mask-image-linear-to-color": [{ "mask-linear-to": k() }],
			"mask-image-t-from-pos": [{ "mask-t-from": P() }],
			"mask-image-t-to-pos": [{ "mask-t-to": P() }],
			"mask-image-t-from-color": [{ "mask-t-from": k() }],
			"mask-image-t-to-color": [{ "mask-t-to": k() }],
			"mask-image-r-from-pos": [{ "mask-r-from": P() }],
			"mask-image-r-to-pos": [{ "mask-r-to": P() }],
			"mask-image-r-from-color": [{ "mask-r-from": k() }],
			"mask-image-r-to-color": [{ "mask-r-to": k() }],
			"mask-image-b-from-pos": [{ "mask-b-from": P() }],
			"mask-image-b-to-pos": [{ "mask-b-to": P() }],
			"mask-image-b-from-color": [{ "mask-b-from": k() }],
			"mask-image-b-to-color": [{ "mask-b-to": k() }],
			"mask-image-l-from-pos": [{ "mask-l-from": P() }],
			"mask-image-l-to-pos": [{ "mask-l-to": P() }],
			"mask-image-l-from-color": [{ "mask-l-from": k() }],
			"mask-image-l-to-color": [{ "mask-l-to": k() }],
			"mask-image-x-from-pos": [{ "mask-x-from": P() }],
			"mask-image-x-to-pos": [{ "mask-x-to": P() }],
			"mask-image-x-from-color": [{ "mask-x-from": k() }],
			"mask-image-x-to-color": [{ "mask-x-to": k() }],
			"mask-image-y-from-pos": [{ "mask-y-from": P() }],
			"mask-image-y-to-pos": [{ "mask-y-to": P() }],
			"mask-image-y-from-color": [{ "mask-y-from": k() }],
			"mask-image-y-to-color": [{ "mask-y-to": k() }],
			"mask-image-radial": [{ "mask-radial": [L, I] }],
			"mask-image-radial-from-pos": [{ "mask-radial-from": P() }],
			"mask-image-radial-to-pos": [{ "mask-radial-to": P() }],
			"mask-image-radial-from-color": [{ "mask-radial-from": k() }],
			"mask-image-radial-to-color": [{ "mask-radial-to": k() }],
			"mask-image-radial-shape": [{ "mask-radial": ["circle", "ellipse"] }],
			"mask-image-radial-size": [{ "mask-radial": [{
				closest: ["side", "corner"],
				farthest: ["side", "corner"]
			}] }],
			"mask-image-radial-pos": [{ "mask-radial-at": b() }],
			"mask-image-conic-pos": [{ "mask-conic": [F] }],
			"mask-image-conic-from-pos": [{ "mask-conic-from": P() }],
			"mask-image-conic-to-pos": [{ "mask-conic-to": P() }],
			"mask-image-conic-from-color": [{ "mask-conic-from": k() }],
			"mask-image-conic-to-color": [{ "mask-conic-to": k() }],
			"mask-mode": [{ mask: [
				"alpha",
				"luminance",
				"match"
			] }],
			"mask-origin": [{ "mask-origin": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }],
			"mask-position": [{ mask: A() }],
			"mask-repeat": [{ mask: se() }],
			"mask-size": [{ mask: ce() }],
			"mask-type": [{ "mask-type": ["alpha", "luminance"] }],
			"mask-image": [{ mask: [
				"none",
				L,
				I
			] }],
			filter: [{ filter: [
				"",
				"none",
				L,
				I
			] }],
			blur: [{ blur: de() }],
			brightness: [{ brightness: [
				F,
				L,
				I
			] }],
			contrast: [{ contrast: [
				F,
				L,
				I
			] }],
			"drop-shadow": [{ "drop-shadow": [
				"",
				"none",
				p,
				Ct,
				_t
			] }],
			"drop-shadow-color": [{ "drop-shadow": k() }],
			grayscale: [{ grayscale: [
				"",
				F,
				L,
				I
			] }],
			"hue-rotate": [{ "hue-rotate": [
				F,
				L,
				I
			] }],
			invert: [{ invert: [
				"",
				F,
				L,
				I
			] }],
			saturate: [{ saturate: [
				F,
				L,
				I
			] }],
			sepia: [{ sepia: [
				"",
				F,
				L,
				I
			] }],
			"backdrop-filter": [{ "backdrop-filter": [
				"",
				"none",
				L,
				I
			] }],
			"backdrop-blur": [{ "backdrop-blur": de() }],
			"backdrop-brightness": [{ "backdrop-brightness": [
				F,
				L,
				I
			] }],
			"backdrop-contrast": [{ "backdrop-contrast": [
				F,
				L,
				I
			] }],
			"backdrop-grayscale": [{ "backdrop-grayscale": [
				"",
				F,
				L,
				I
			] }],
			"backdrop-hue-rotate": [{ "backdrop-hue-rotate": [
				F,
				L,
				I
			] }],
			"backdrop-invert": [{ "backdrop-invert": [
				"",
				F,
				L,
				I
			] }],
			"backdrop-opacity": [{ "backdrop-opacity": [
				F,
				L,
				I
			] }],
			"backdrop-saturate": [{ "backdrop-saturate": [
				F,
				L,
				I
			] }],
			"backdrop-sepia": [{ "backdrop-sepia": [
				"",
				F,
				L,
				I
			] }],
			"border-collapse": [{ border: ["collapse", "separate"] }],
			"border-spacing": [{ "border-spacing": w() }],
			"border-spacing-x": [{ "border-spacing-x": w() }],
			"border-spacing-y": [{ "border-spacing-y": w() }],
			"table-layout": [{ table: ["auto", "fixed"] }],
			caption: [{ caption: ["top", "bottom"] }],
			transition: [{ transition: [
				"",
				"all",
				"colors",
				"opacity",
				"shadow",
				"transform",
				"none",
				L,
				I
			] }],
			"transition-behavior": [{ transition: ["normal", "discrete"] }],
			duration: [{ duration: [
				F,
				"initial",
				L,
				I
			] }],
			ease: [{ ease: [
				"linear",
				"initial",
				_,
				L,
				I
			] }],
			delay: [{ delay: [
				F,
				L,
				I
			] }],
			animate: [{ animate: [
				"none",
				v,
				L,
				I
			] }],
			backface: [{ backface: ["hidden", "visible"] }],
			perspective: [{ perspective: [
				h,
				L,
				I
			] }],
			"perspective-origin": [{ "perspective-origin": x() }],
			rotate: [{ rotate: fe() }],
			"rotate-x": [{ "rotate-x": fe() }],
			"rotate-y": [{ "rotate-y": fe() }],
			"rotate-z": [{ "rotate-z": fe() }],
			scale: [{ scale: pe() }],
			"scale-x": [{ "scale-x": pe() }],
			"scale-y": [{ "scale-y": pe() }],
			"scale-z": [{ "scale-z": pe() }],
			"scale-3d": ["scale-3d"],
			skew: [{ skew: me() }],
			"skew-x": [{ "skew-x": me() }],
			"skew-y": [{ "skew-y": me() }],
			transform: [{ transform: [
				L,
				I,
				"",
				"none",
				"gpu",
				"cpu"
			] }],
			"transform-origin": [{ origin: x() }],
			"transform-style": [{ transform: ["3d", "flat"] }],
			translate: [{ translate: he() }],
			"translate-x": [{ "translate-x": he() }],
			"translate-y": [{ "translate-y": he() }],
			"translate-z": [{ "translate-z": he() }],
			"translate-none": ["translate-none"],
			zoom: [{ zoom: [
				et,
				L,
				I
			] }],
			accent: [{ accent: k() }],
			appearance: [{ appearance: ["none", "auto"] }],
			"caret-color": [{ caret: k() }],
			"color-scheme": [{ scheme: [
				"normal",
				"dark",
				"light",
				"light-dark",
				"only-dark",
				"only-light"
			] }],
			cursor: [{ cursor: [
				"auto",
				"default",
				"pointer",
				"wait",
				"text",
				"move",
				"help",
				"not-allowed",
				"none",
				"context-menu",
				"progress",
				"cell",
				"crosshair",
				"vertical-text",
				"alias",
				"copy",
				"no-drop",
				"grab",
				"grabbing",
				"all-scroll",
				"col-resize",
				"row-resize",
				"n-resize",
				"e-resize",
				"s-resize",
				"w-resize",
				"ne-resize",
				"nw-resize",
				"se-resize",
				"sw-resize",
				"ew-resize",
				"ns-resize",
				"nesw-resize",
				"nwse-resize",
				"zoom-in",
				"zoom-out",
				L,
				I
			] }],
			"field-sizing": [{ "field-sizing": ["fixed", "content"] }],
			"pointer-events": [{ "pointer-events": ["auto", "none"] }],
			resize: [{ resize: [
				"none",
				"",
				"y",
				"x"
			] }],
			"scroll-behavior": [{ scroll: ["auto", "smooth"] }],
			"scrollbar-thumb-color": [{ "scrollbar-thumb": k() }],
			"scrollbar-track-color": [{ "scrollbar-track": k() }],
			"scrollbar-gutter": [{ "scrollbar-gutter": [
				"auto",
				"stable",
				"both"
			] }],
			"scrollbar-w": [{ scrollbar: [
				"auto",
				"thin",
				"none"
			] }],
			"scroll-m": [{ "scroll-m": w() }],
			"scroll-mx": [{ "scroll-mx": w() }],
			"scroll-my": [{ "scroll-my": w() }],
			"scroll-ms": [{ "scroll-ms": w() }],
			"scroll-me": [{ "scroll-me": w() }],
			"scroll-mbs": [{ "scroll-mbs": w() }],
			"scroll-mbe": [{ "scroll-mbe": w() }],
			"scroll-mt": [{ "scroll-mt": w() }],
			"scroll-mr": [{ "scroll-mr": w() }],
			"scroll-mb": [{ "scroll-mb": w() }],
			"scroll-ml": [{ "scroll-ml": w() }],
			"scroll-p": [{ "scroll-p": w() }],
			"scroll-px": [{ "scroll-px": w() }],
			"scroll-py": [{ "scroll-py": w() }],
			"scroll-ps": [{ "scroll-ps": w() }],
			"scroll-pe": [{ "scroll-pe": w() }],
			"scroll-pbs": [{ "scroll-pbs": w() }],
			"scroll-pbe": [{ "scroll-pbe": w() }],
			"scroll-pt": [{ "scroll-pt": w() }],
			"scroll-pr": [{ "scroll-pr": w() }],
			"scroll-pb": [{ "scroll-pb": w() }],
			"scroll-pl": [{ "scroll-pl": w() }],
			"snap-align": [{ snap: [
				"start",
				"end",
				"center",
				"align-none"
			] }],
			"snap-stop": [{ snap: ["normal", "always"] }],
			"snap-type": [{ snap: [
				"none",
				"x",
				"y",
				"both"
			] }],
			"snap-strictness": [{ snap: ["mandatory", "proximity"] }],
			touch: [{ touch: [
				"auto",
				"none",
				"manipulation"
			] }],
			"touch-x": [{ "touch-pan": [
				"x",
				"left",
				"right"
			] }],
			"touch-y": [{ "touch-pan": [
				"y",
				"up",
				"down"
			] }],
			"touch-pz": ["touch-pinch-zoom"],
			select: [{ select: [
				"none",
				"text",
				"all",
				"auto"
			] }],
			"will-change": [{ "will-change": [
				"auto",
				"scroll",
				"contents",
				"transform",
				L,
				I
			] }],
			fill: [{ fill: ["none", ...k()] }],
			"stroke-w": [{ stroke: [
				F,
				vt,
				dt,
				ft
			] }],
			stroke: [{ stroke: ["none", ...k()] }],
			"forced-color-adjust": [{ "forced-color-adjust": ["auto", "none"] }]
		},
		conflictingClassGroups: {
			"container-named": ["container-type"],
			overflow: ["overflow-x", "overflow-y"],
			overscroll: ["overscroll-x", "overscroll-y"],
			inset: [
				"inset-x",
				"inset-y",
				"inset-bs",
				"inset-be",
				"start",
				"end",
				"top",
				"right",
				"bottom",
				"left"
			],
			"inset-x": ["right", "left"],
			"inset-y": ["top", "bottom"],
			flex: [
				"basis",
				"grow",
				"shrink"
			],
			gap: ["gap-x", "gap-y"],
			p: [
				"px",
				"py",
				"ps",
				"pe",
				"pbs",
				"pbe",
				"pt",
				"pr",
				"pb",
				"pl"
			],
			px: ["pr", "pl"],
			py: ["pt", "pb"],
			m: [
				"mx",
				"my",
				"ms",
				"me",
				"mbs",
				"mbe",
				"mt",
				"mr",
				"mb",
				"ml"
			],
			mx: ["mr", "ml"],
			my: ["mt", "mb"],
			size: ["w", "h"],
			"font-size": ["leading"],
			"fvn-normal": [
				"fvn-ordinal",
				"fvn-slashed-zero",
				"fvn-figure",
				"fvn-spacing",
				"fvn-fraction"
			],
			"fvn-ordinal": ["fvn-normal"],
			"fvn-slashed-zero": ["fvn-normal"],
			"fvn-figure": ["fvn-normal"],
			"fvn-spacing": ["fvn-normal"],
			"fvn-fraction": ["fvn-normal"],
			"line-clamp": ["display", "overflow"],
			rounded: [
				"rounded-s",
				"rounded-e",
				"rounded-t",
				"rounded-r",
				"rounded-b",
				"rounded-l",
				"rounded-ss",
				"rounded-se",
				"rounded-ee",
				"rounded-es",
				"rounded-tl",
				"rounded-tr",
				"rounded-br",
				"rounded-bl"
			],
			"rounded-s": ["rounded-ss", "rounded-es"],
			"rounded-e": ["rounded-se", "rounded-ee"],
			"rounded-t": ["rounded-tl", "rounded-tr"],
			"rounded-r": ["rounded-tr", "rounded-br"],
			"rounded-b": ["rounded-br", "rounded-bl"],
			"rounded-l": ["rounded-tl", "rounded-bl"],
			"border-spacing": ["border-spacing-x", "border-spacing-y"],
			"border-w": [
				"border-w-x",
				"border-w-y",
				"border-w-s",
				"border-w-e",
				"border-w-bs",
				"border-w-be",
				"border-w-t",
				"border-w-r",
				"border-w-b",
				"border-w-l"
			],
			"border-w-x": ["border-w-r", "border-w-l"],
			"border-w-y": ["border-w-t", "border-w-b"],
			"border-color": [
				"border-color-x",
				"border-color-y",
				"border-color-s",
				"border-color-e",
				"border-color-bs",
				"border-color-be",
				"border-color-t",
				"border-color-r",
				"border-color-b",
				"border-color-l"
			],
			"border-color-x": ["border-color-r", "border-color-l"],
			"border-color-y": ["border-color-t", "border-color-b"],
			translate: [
				"translate-x",
				"translate-y",
				"translate-none"
			],
			"translate-none": [
				"translate",
				"translate-x",
				"translate-y",
				"translate-z"
			],
			"scroll-m": [
				"scroll-mx",
				"scroll-my",
				"scroll-ms",
				"scroll-me",
				"scroll-mbs",
				"scroll-mbe",
				"scroll-mt",
				"scroll-mr",
				"scroll-mb",
				"scroll-ml"
			],
			"scroll-mx": ["scroll-mr", "scroll-ml"],
			"scroll-my": ["scroll-mt", "scroll-mb"],
			"scroll-p": [
				"scroll-px",
				"scroll-py",
				"scroll-ps",
				"scroll-pe",
				"scroll-pbs",
				"scroll-pbe",
				"scroll-pt",
				"scroll-pr",
				"scroll-pb",
				"scroll-pl"
			],
			"scroll-px": ["scroll-pr", "scroll-pl"],
			"scroll-py": ["scroll-pt", "scroll-pb"],
			touch: [
				"touch-x",
				"touch-y",
				"touch-pz"
			],
			"touch-x": ["touch"],
			"touch-y": ["touch"],
			"touch-pz": ["touch"]
		},
		conflictingClassGroupModifiers: { "font-size": ["leading"] },
		postfixLookupClassGroups: ["container-type"],
		orderSensitiveModifiers: [
			"*",
			"**",
			"after",
			"backdrop",
			"before",
			"details-content",
			"file",
			"first-letter",
			"first-line",
			"marker",
			"placeholder",
			"selection"
		]
	};
});
//#endregion
//#region lib/utils.ts
function It(...e) {
	return Ft(P(e));
}
//#endregion
//#region node_modules/react/cjs/react-jsx-runtime.production.js
var Lt = /* @__PURE__ */ o(((e) => {
	var t = Symbol.for("react.transitional.element"), n = Symbol.for("react.fragment");
	function r(e, n, r) {
		var i = null;
		if (r !== void 0 && (i = "" + r), n.key !== void 0 && (i = "" + n.key), "key" in n) for (var a in r = {}, n) a !== "key" && (r[a] = n[a]);
		else r = n;
		return n = r.ref, {
			$$typeof: t,
			type: e,
			key: i,
			ref: n === void 0 ? null : n,
			props: r
		};
	}
	e.Fragment = n, e.jsx = r, e.jsxs = r;
})), R = (/* @__PURE__ */ o(((e, t) => {
	t.exports = Lt();
})))();
function Rt({ className: e, ...t }) {
	return /* @__PURE__ */ (0, R.jsx)("div", {
		"data-slot": "table-container",
		className: "relative w-full overflow-x-auto",
		children: /* @__PURE__ */ (0, R.jsx)("table", {
			"data-slot": "table",
			className: It("w-full caption-bottom text-sm", e),
			...t
		})
	});
}
function zt({ className: e, ...t }) {
	return /* @__PURE__ */ (0, R.jsx)("thead", {
		"data-slot": "table-header",
		className: It("[&_tr]:border-b", e),
		...t
	});
}
function Bt({ className: e, ...t }) {
	return /* @__PURE__ */ (0, R.jsx)("tbody", {
		"data-slot": "table-body",
		className: It("[&_tr:last-child]:border-0", e),
		...t
	});
}
function Vt({ className: e, ...t }) {
	return /* @__PURE__ */ (0, R.jsx)("tr", {
		"data-slot": "table-row",
		className: It("hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors has-aria-expanded:bg-muted/50", e),
		...t
	});
}
function Ht({ className: e, ...t }) {
	return /* @__PURE__ */ (0, R.jsx)("th", {
		"data-slot": "table-head",
		className: It("text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0", e),
		...t
	});
}
function Ut({ className: e, ...t }) {
	return /* @__PURE__ */ (0, R.jsx)("td", {
		"data-slot": "table-cell",
		className: It("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", e),
		...t
	});
}
function Wt({ className: e, ...t }) {
	return /* @__PURE__ */ (0, R.jsx)("caption", {
		"data-slot": "table-caption",
		className: It("text-muted-foreground mt-4 text-sm", e),
		...t
	});
}
//#endregion
//#region lib/surveys.ts
var Gt = [
	{
		id: "1",
		label: "Not at all like me",
		value: 1
	},
	{
		id: "2",
		label: "A little like me",
		value: 2
	},
	{
		id: "3",
		label: "Somewhat like me",
		value: 3
	},
	{
		id: "4",
		label: "Very much like me",
		value: 4
	},
	{
		id: "5",
		label: "Exactly like me",
		value: 5
	}
], Kt = [
	{
		id: "free-saturday",
		prompt: "A completely free Saturday appears. What sounds best?",
		options: [
			{
				id: "shared-plan",
				label: "Text someone and turn it into a shared plan",
				category: "connector"
			},
			{
				id: "short-plan",
				label: "Make a short plan for the day",
				category: "planner"
			},
			{
				id: "follow-mood",
				label: "Follow your mood and decide as you go",
				category: "improviser"
			},
			{
				id: "try-new",
				label: "Try a place or activity you have not done before",
				category: "explorer"
			},
			{
				id: "familiar-comforts",
				label: "Stay close to home with familiar comforts",
				category: "comfort"
			}
		]
	},
	{
		id: "restaurant",
		prompt: "How would you choose a restaurant?",
		options: [
			{
				id: "known-place",
				label: "Pick somewhere familiar where you know what you like",
				category: "comfort"
			},
			{
				id: "new-cuisine",
				label: "Choose a cuisine or place you have never tried",
				category: "explorer"
			},
			{
				id: "compare-first",
				label: "Compare menus, prices, and reviews first",
				category: "planner"
			},
			{
				id: "group-choice",
				label: "Go wherever the group will enjoy most",
				category: "connector"
			},
			{
				id: "nearest-decent",
				label: "Choose the nearest decent option when hunger wins",
				category: "improviser"
			}
		]
	},
	{
		id: "packing",
		prompt: "How would you pack for a weekend away?",
		options: [
			{
				id: "ask-group",
				label: "Ask what everyone else is bringing so the group is covered",
				category: "connector"
			},
			{
				id: "comfort-extras",
				label: "Pack comfortable favorites and a few reassuring extras",
				category: "comfort"
			},
			{
				id: "last-minute",
				label: "Throw in the basics shortly before leaving",
				category: "improviser"
			},
			{
				id: "checklist",
				label: "Use a checklist and pack ahead of time",
				category: "planner"
			},
			{
				id: "unexpected-detour",
				label: "Pack for an unexpected detour or adventure",
				category: "explorer"
			}
		]
	},
	{
		id: "buy-item",
		prompt: "You need to buy an everyday item. What do you do?",
		options: [
			{
				id: "trusted-judgment",
				label: "Ask someone whose judgment you trust",
				category: "connector"
			},
			{
				id: "first-that-works",
				label: "Buy the first option that clearly does the job",
				category: "improviser"
			},
			{
				id: "specs-reviews",
				label: "Compare specifications, reviews, and prices",
				category: "planner"
			},
			{
				id: "known-brand",
				label: "Choose a brand or model you already know",
				category: "comfort"
			},
			{
				id: "newest-option",
				label: "Try the newest or most interesting option",
				category: "explorer"
			}
		]
	},
	{
		id: "after-demanding-day",
		prompt: "What sounds best after a demanding day?",
		options: [
			{
				id: "change-scenery",
				label: "Get a change of scenery or do something different",
				category: "explorer"
			},
			{
				id: "contact-someone",
				label: "Call, message, or meet someone",
				category: "connector"
			},
			{
				id: "favorite-routine",
				label: "Have your favorite food, show, or routine",
				category: "comfort"
			},
			{
				id: "prepare-tomorrow",
				label: "Tidy up and prepare for tomorrow",
				category: "planner"
			},
			{
				id: "whatever-feels-good",
				label: "Do whatever sounds good in the moment",
				category: "improviser"
			}
		]
	}
], qt = [
	{
		id: "structure",
		dimension: "Structure",
		prompt: "I like to know what I am doing before the day begins.",
		options: Gt
	},
	{
		id: "social-recharge",
		dimension: "Social recharge",
		prompt: "After a demanding week, spending time with other people usually restores my energy.",
		options: Gt
	},
	{
		id: "novelty",
		dimension: "Novelty",
		prompt: "Given a safe choice, I usually prefer a new experience to a dependable favorite.",
		options: Gt
	},
	{
		id: "decision-speed",
		dimension: "Decision speed",
		prompt: "Once I have enough information, I make decisions quickly.",
		options: Gt
	},
	{
		id: "expressiveness",
		dimension: "Expressiveness",
		prompt: "People can usually tell how I am feeling without asking.",
		options: Gt
	}
], Jt = [
	{
		id: "cancelled-plans",
		prompt: "Your plans are cancelled an hour before they start. What do you do?",
		options: [
			{
				id: "open-space",
				label: "Enjoy the open space and see where the day goes",
				category: "adapter"
			},
			{
				id: "check-change",
				label: "Check what changed and compare the available options",
				category: "analyst"
			},
			{
				id: "reliable-backup",
				label: "Switch to a dependable, low-effort backup",
				category: "anchor"
			},
			{
				id: "ask-everyone",
				label: "Ask what everyone now feels like doing",
				category: "collaborator"
			},
			{
				id: "replace-plan",
				label: "Suggest a replacement plan immediately",
				category: "fixer"
			}
		]
	},
	{
		id: "stops-working",
		prompt: "Something you need suddenly stops working. What is your first move?",
		options: [
			{
				id: "workaround",
				label: "Use a different tool or invent a workaround",
				category: "adapter"
			},
			{
				id: "likely-causes",
				label: "Look up likely causes before touching anything",
				category: "analyst"
			},
			{
				id: "repair-first",
				label: "Repair or restart the obvious parts first",
				category: "fixer"
			},
			{
				id: "ask-expert",
				label: "Ask someone experienced to help",
				category: "collaborator"
			},
			{
				id: "make-safe",
				label: "Make the situation safe and avoid causing more damage",
				category: "anchor"
			}
		]
	},
	{
		id: "vague-help",
		prompt: "A friend asks for help but describes the problem vaguely. What do you do?",
		options: [
			{
				id: "next-step",
				label: "Offer one concrete next step",
				category: "fixer"
			},
			{
				id: "listen-first",
				label: "Listen first and make sure they feel understood",
				category: "collaborator"
			},
			{
				id: "clarify",
				label: "Ask questions until the real problem is clearer",
				category: "analyst"
			},
			{
				id: "urgent-part",
				label: "Help them slow down and handle the most urgent part",
				category: "anchor"
			},
			{
				id: "give-options",
				label: "Offer a few options and let them steer",
				category: "adapter"
			}
		]
	},
	{
		id: "day-trip",
		prompt: "Your group cannot choose a day trip. What do you do?",
		options: [
			{
				id: "quick-vote",
				label: "Run a quick vote so everyone has a say",
				category: "collaborator"
			},
			{
				id: "easy-option",
				label: "Recommend the easiest reliable option",
				category: "anchor"
			},
			{
				id: "adapt-to-winner",
				label: "Say you can adapt to whichever option wins",
				category: "adapter"
			},
			{
				id: "compare-trip",
				label: "Compare travel time, cost, and what is open",
				category: "analyst"
			},
			{
				id: "propose-one",
				label: "Choose one good option and propose it",
				category: "fixer"
			}
		]
	},
	{
		id: "extra-money",
		prompt: "You unexpectedly receive 100 euros. What are you most likely to do?",
		options: [
			{
				id: "save-it",
				label: "Save it for a future need",
				category: "anchor"
			},
			{
				id: "share-it",
				label: "Use some for a shared meal, outing, or gift",
				category: "collaborator"
			},
			{
				id: "useful-thing",
				label: "Put it toward something useful you have meant to get",
				category: "fixer"
			},
			{
				id: "compare-options",
				label: "Compare saving, spending, and investing before deciding",
				category: "analyst"
			},
			{
				id: "keep-available",
				label: "Keep it available until something catches your interest",
				category: "adapter"
			}
		]
	}
], Yt = [
	{
		id: "q1",
		prompt: "Your group chat is blowing up at midnight. You...",
		options: [
			{
				id: "a",
				label: "Arrive with takes and a snack tier list",
				weights: [
					2,
					1,
					2,
					1
				]
			},
			{
				id: "b",
				label: "Read everything and respond with one perfect emoji",
				weights: [
					-1,
					2,
					-1,
					-1
				]
			},
			{
				id: "c",
				label: "Mute until morning, then send a thesis",
				weights: [
					-2,
					2,
					1,
					0
				]
			},
			{
				id: "d",
				label: "Start a poll to restore order",
				weights: [
					1,
					2,
					0,
					2
				]
			}
		]
	},
	{
		id: "q2",
		prompt: "A new app drops and everyone pretends they always knew about it. You...",
		options: [
			{
				id: "a",
				label: "Install immediately and become the tutorial person",
				weights: [
					2,
					1,
					1,
					1
				]
			},
			{
				id: "b",
				label: "Wait a week for the patch notes of society",
				weights: [
					-2,
					2,
					-1,
					-1
				]
			},
			{
				id: "c",
				label: "Post a joke review before reading the terms",
				weights: [
					1,
					-2,
					2,
					0
				]
			},
			{
				id: "d",
				label: "Research quietly, then drop a link like a bat signal",
				weights: [
					-1,
					2,
					0,
					1
				]
			}
		]
	},
	{
		id: "q3",
		prompt: "Your calendar looks like modern art. Your reaction is...",
		options: [
			{
				id: "a",
				label: "Color-code until it becomes a personality",
				weights: [
					0,
					2,
					0,
					1
				]
			},
			{
				id: "b",
				label: "Ignore it and trust vibes (risky)",
				weights: [
					0,
					-2,
					1,
					-1
				]
			},
			{
				id: "c",
				label: "Cancel one thing to feel alive",
				weights: [
					-1,
					-1,
					2,
					1
				]
			},
			{
				id: "d",
				label: "Add a 'breathing' block like you're a firmware update",
				weights: [
					0,
					2,
					-1,
					-1
				]
			}
		]
	},
	{
		id: "q4",
		prompt: "Someone is wrong on the internet (again). You...",
		options: [
			{
				id: "a",
				label: "Debate with sources and screenshots",
				weights: [
					2,
					1,
					2,
					2
				]
			},
			{
				id: "b",
				label: "Close the tab and touch grass (metaphorically)",
				weights: [
					-2,
					1,
					-2,
					-2
				]
			},
			{
				id: "c",
				label: "Quote tweet with a joke that ends careers",
				weights: [
					1,
					-1,
					2,
					1
				]
			},
			{
				id: "d",
				label: "Send a private message like a diplomat",
				weights: [
					-1,
					2,
					0,
					-2
				]
			}
		]
	},
	{
		id: "q5",
		prompt: "Your ideal weekend is...",
		options: [
			{
				id: "a",
				label: "People, plans, and a little planned chaos",
				weights: [
					2,
					1,
					1,
					0
				]
			},
			{
				id: "b",
				label: "Solo project + playlist + zero obligations",
				weights: [
					-2,
					1,
					0,
					-1
				]
			},
			{
				id: "c",
				label: "Spontaneous trip because someone said 'what if'",
				weights: [
					1,
					-2,
					2,
					1
				]
			},
			{
				id: "d",
				label: "Hosting: you bring the board games and boundaries",
				weights: [
					2,
					2,
					0,
					1
				]
			}
		]
	},
	{
		id: "q6",
		prompt: "Notifications are...",
		options: [
			{
				id: "a",
				label: "Dopamine slot machines (I'm fine)",
				weights: [
					2,
					-1,
					2,
					0
				]
			},
			{
				id: "b",
				label: "A tax I pay to exist online",
				weights: [
					-1,
					2,
					-1,
					-1
				]
			},
			{
				id: "c",
				label: "A to-do list written by gremlins",
				weights: [
					0,
					-2,
					1,
					1
				]
			},
			{
				id: "d",
				label: "Managed like a small government",
				weights: [
					0,
					2,
					-2,
					1
				]
			}
		]
	},
	{
		id: "q7",
		prompt: "When you learn something new, you...",
		options: [
			{
				id: "a",
				label: "Tell everyone immediately (education is sharing)",
				weights: [
					2,
					0,
					1,
					0
				]
			},
			{
				id: "b",
				label: "Take notes and forget where you saved them",
				weights: [
					-1,
					-1,
					0,
					-1
				]
			},
			{
				id: "c",
				label: "Go deep until it's a personality trait",
				weights: [
					-1,
					1,
					2,
					1
				]
			},
			{
				id: "d",
				label: "Build a system so you never learn it wrong again",
				weights: [
					0,
					2,
					0,
					1
				]
			}
		]
	},
	{
		id: "q8",
		prompt: "Your relationship with deadlines is best described as...",
		options: [
			{
				id: "a",
				label: "We're coworkers who respect each other",
				weights: [
					0,
					2,
					0,
					1
				]
			},
			{
				id: "b",
				label: "They're suggestions from a parallel universe",
				weights: [
					0,
					-2,
					2,
					0
				]
			},
			{
				id: "c",
				label: "I finish early to flex emotionally",
				weights: [
					1,
					2,
					1,
					2
				]
			},
			{
				id: "d",
				label: "I need adrenaline to unlock literacy",
				weights: [
					1,
					-2,
					2,
					1
				]
			}
		]
	},
	{
		id: "q9",
		prompt: "A friend vents for 20 minutes. You...",
		options: [
			{
				id: "a",
				label: "Match their energy and escalate supportively",
				weights: [
					1,
					0,
					2,
					0
				]
			},
			{
				id: "b",
				label: "Listen quietly and ask one sharp question",
				weights: [
					-1,
					1,
					0,
					-1
				]
			},
			{
				id: "c",
				label: "Offer solutions like a startup founder",
				weights: [
					1,
					2,
					0,
					2
				]
			},
			{
				id: "d",
				label: "Send memes until the vibe stabilizes",
				weights: [
					1,
					-1,
					2,
					-1
				]
			}
		]
	},
	{
		id: "q10",
		prompt: "Your shopping cart is...",
		options: [
			{
				id: "a",
				label: "A vision board with shipping fees",
				weights: [
					1,
					-1,
					2,
					0
				]
			},
			{
				id: "b",
				label: "Curated, compared, and slightly haunted",
				weights: [
					-1,
					2,
					0,
					0
				]
			},
			{
				id: "c",
				label: "Empty because I'm 'being good' (lying)",
				weights: [
					-1,
					1,
					1,
					-1
				]
			},
			{
				id: "d",
				label: "One weird item that explains my entire psyche",
				weights: [
					0,
					-2,
					2,
					1
				]
			}
		]
	},
	{
		id: "q11",
		prompt: "Conflict in a group project appears. You...",
		options: [
			{
				id: "a",
				label: "Take the mic and propose a structure",
				weights: [
					2,
					2,
					1,
					2
				]
			},
			{
				id: "b",
				label: "Slip helpful notes like a ghost editor",
				weights: [
					-2,
					2,
					-1,
					-2
				]
			},
			{
				id: "c",
				label: "Make a joke so nobody cries",
				weights: [
					1,
					-1,
					2,
					-1
				]
			},
			{
				id: "d",
				label: "Divide tasks like a benevolent warlord",
				weights: [
					1,
					2,
					0,
					2
				]
			}
		]
	},
	{
		id: "q12",
		prompt: "Your aesthetic online is...",
		options: [
			{
				id: "a",
				label: "Curated chaos with good lighting",
				weights: [
					2,
					-1,
					2,
					0
				]
			},
			{
				id: "b",
				label: "Minimalist until you're not",
				weights: [
					-1,
					2,
					0,
					0
				]
			},
			{
				id: "c",
				label: "Lore-heavy and slightly threatening",
				weights: [
					-1,
					1,
					2,
					1
				]
			},
			{
				id: "d",
				label: "Friendly and approachable (weaponized)",
				weights: [
					2,
					1,
					0,
					-1
				]
			}
		]
	},
	{
		id: "q13",
		prompt: "When plans change last minute, you feel...",
		options: [
			{
				id: "a",
				label: "Thrilled - new timeline unlocked",
				weights: [
					1,
					-2,
					2,
					0
				]
			},
			{
				id: "b",
				label: "Annoyed but adaptable (silently)",
				weights: [
					-1,
					1,
					0,
					-1
				]
			},
			{
				id: "c",
				label: "Ready to negotiate like it's a sport",
				weights: [
					1,
					2,
					1,
					2
				]
			},
			{
				id: "d",
				label: "Relieved - I wanted an excuse to stay in",
				weights: [
					-2,
					1,
					-1,
					-2
				]
			}
		]
	},
	{
		id: "q14",
		prompt: "You get a compliment in public. You...",
		options: [
			{
				id: "a",
				label: "Radiate like a lighthouse",
				weights: [
					2,
					0,
					2,
					0
				]
			},
			{
				id: "b",
				label: "Nod and evaporate",
				weights: [
					-2,
					1,
					-2,
					-2
				]
			},
			{
				id: "c",
				label: "Deflect with humor (too fast)",
				weights: [
					1,
					-1,
					1,
					-1
				]
			},
			{
				id: "d",
				label: "Say thank you like you practiced in a mirror",
				weights: [
					0,
					2,
					0,
					1
				]
			}
		]
	},
	{
		id: "q15",
		prompt: "Your notes app contains...",
		options: [
			{
				id: "a",
				label: "Lists inside lists (inception)",
				weights: [
					0,
					2,
					0,
					1
				]
			},
			{
				id: "b",
				label: "Poetry and passwords (bad)",
				weights: [
					-1,
					-2,
					2,
					0
				]
			},
			{
				id: "c",
				label: "Half-baked ideas labeled 'later'",
				weights: [
					0,
					-1,
					1,
					-1
				]
			},
			{
				id: "d",
				label: "Nothing - I live in the moment (lie)",
				weights: [
					1,
					-2,
					2,
					1
				]
			}
		]
	},
	{
		id: "q16",
		prompt: "A trend is annoying but everywhere. You...",
		options: [
			{
				id: "a",
				label: "Participate ironically until it's sincere",
				weights: [
					2,
					-1,
					2,
					0
				]
			},
			{
				id: "b",
				label: "Observe from a distance like a scientist",
				weights: [
					-2,
					2,
					-1,
					0
				]
			},
			{
				id: "c",
				label: "Complain creatively",
				weights: [
					1,
					0,
					2,
					1
				]
			},
			{
				id: "d",
				label: "Ignore it until it dies naturally",
				weights: [
					-1,
					1,
					-2,
					-2
				]
			}
		]
	},
	{
		id: "q17",
		prompt: "Your dream collaboration is with...",
		options: [
			{
				id: "a",
				label: "A crowd - more minds, more memes",
				weights: [
					2,
					0,
					1,
					0
				]
			},
			{
				id: "b",
				label: "One person who gets your weird",
				weights: [
					-2,
					1,
					1,
					0
				]
			},
			{
				id: "c",
				label: "Future you (time travel budget pending)",
				weights: [
					-1,
					1,
					2,
					1
				]
			},
			{
				id: "d",
				label: "A rival - healthy competition",
				weights: [
					1,
					1,
					1,
					2
				]
			}
		]
	},
	{
		id: "q18",
		prompt: "When you're stressed, you...",
		options: [
			{
				id: "a",
				label: "Talk it out until it's a podcast",
				weights: [
					2,
					0,
					2,
					0
				]
			},
			{
				id: "b",
				label: "Go quiet and fix things in silence",
				weights: [
					-2,
					2,
					0,
					-1
				]
			},
			{
				id: "c",
				label: "Make jokes to avoid feelings (works until it doesn't)",
				weights: [
					1,
					-1,
					2,
					-1
				]
			},
			{
				id: "d",
				label: "Make a plan so aggressive it calms you down",
				weights: [
					0,
					2,
					1,
					2
				]
			}
		]
	},
	{
		id: "q19",
		prompt: "Your relationship with 'reply all' is...",
		options: [
			{
				id: "a",
				label: "Weaponized joy",
				weights: [
					2,
					-1,
					2,
					1
				]
			},
			{
				id: "b",
				label: "A crime scene I avoid",
				weights: [
					-2,
					2,
					-2,
					-2
				]
			},
			{
				id: "c",
				label: "Situational comedy",
				weights: [
					1,
					-2,
					2,
					0
				]
			},
			{
				id: "d",
				label: "Only if I'm saving everyone",
				weights: [
					1,
					2,
					0,
					2
				]
			}
		]
	},
	{
		id: "q20",
		prompt: "You discover a new hyperfixation. It lasts...",
		options: [
			{
				id: "a",
				label: "Until the next shiny object (beautiful)",
				weights: [
					1,
					-2,
					2,
					0
				]
			},
			{
				id: "b",
				label: "Long enough to become an expert",
				weights: [
					-1,
					2,
					1,
					1
				]
			},
			{
				id: "c",
				label: "Forever, quietly, in the background",
				weights: [
					-2,
					1,
					0,
					0
				]
			},
			{
				id: "d",
				label: "Until I monetize it accidentally",
				weights: [
					1,
					1,
					2,
					2
				]
			}
		]
	},
	{
		id: "q21",
		prompt: "Your ideal internet is...",
		options: [
			{
				id: "a",
				label: "A party with good moderation",
				weights: [
					2,
					1,
					1,
					0
				]
			},
			{
				id: "b",
				label: "A library with jokes in the margins",
				weights: [
					-2,
					2,
					0,
					-1
				]
			},
			{
				id: "c",
				label: "An art project that occasionally bites",
				weights: [
					0,
					-1,
					2,
					1
				]
			},
			{
				id: "d",
				label: "A calm feed and a chaotic alt",
				weights: [
					1,
					1,
					1,
					0
				]
			}
		]
	},
	{
		id: "q22",
		prompt: "When you disagree with a friend, you...",
		options: [
			{
				id: "a",
				label: "Say it plainly - love is honest",
				weights: [
					1,
					1,
					1,
					2
				]
			},
			{
				id: "b",
				label: "Soften it until it's a suggestion",
				weights: [
					-1,
					1,
					0,
					-2
				]
			},
			{
				id: "c",
				label: "Debate for sport, hug after",
				weights: [
					2,
					-1,
					2,
					1
				]
			},
			{
				id: "d",
				label: "Write a draft and delete it (classic)",
				weights: [
					-2,
					2,
					1,
					-1
				]
			}
		]
	},
	{
		id: "q23",
		prompt: "Your vibe at a party is...",
		options: [
			{
				id: "a",
				label: "Center of gravity",
				weights: [
					2,
					0,
					2,
					1
				]
			},
			{
				id: "b",
				label: "Wallpaper that occasionally speaks",
				weights: [
					-2,
					1,
					-1,
					-2
				]
			},
			{
				id: "c",
				label: "Kitchen hangout philosopher",
				weights: [
					0,
					0,
					1,
					0
				]
			},
			{
				id: "d",
				label: "Early exit, legendary exit line",
				weights: [
					-1,
					2,
					0,
					0
				]
			}
		]
	},
	{
		id: "q24",
		prompt: "You finish a big project. You celebrate by...",
		options: [
			{
				id: "a",
				label: "Telling people (they need to know)",
				weights: [
					2,
					0,
					2,
					1
				]
			},
			{
				id: "b",
				label: "Disappearing into peace",
				weights: [
					-2,
					1,
					-1,
					-2
				]
			},
			{
				id: "c",
				label: "Immediately starting the next thing (help)",
				weights: [
					1,
					1,
					2,
					2
				]
			},
			{
				id: "d",
				label: "One nice meal and zero screens",
				weights: [
					-1,
					2,
					0,
					-1
				]
			}
		]
	},
	{
		id: "q25",
		prompt: "Your toxic trait (affectionate) is...",
		options: [
			{
				id: "a",
				label: "Too online to log off",
				weights: [
					2,
					-1,
					2,
					0
				]
			},
			{
				id: "b",
				label: "Too offline to explain",
				weights: [
					-2,
					1,
					-1,
					-1
				]
			},
			{
				id: "c",
				label: "Too intense for small talk",
				weights: [
					0,
					0,
					2,
					1
				]
			},
			{
				id: "d",
				label: "Too organized to be spontaneous",
				weights: [
					0,
					2,
					0,
					1
				]
			}
		]
	},
	{
		id: "q26",
		prompt: "If your brain had a UI, it would be...",
		options: [
			{
				id: "a",
				label: "Neon and loud sliders",
				weights: [
					2,
					-2,
					2,
					1
				]
			},
			{
				id: "b",
				label: "Clean monospace and secrets",
				weights: [
					-2,
					2,
					0,
					0
				]
			},
			{
				id: "c",
				label: "A wiki that edits itself",
				weights: [
					-1,
					1,
					2,
					0
				]
			},
			{
				id: "d",
				label: "A single button labeled 'do not'",
				weights: [
					0,
					2,
					1,
					-1
				]
			}
		]
	},
	{
		id: "q27",
		prompt: "You want feedback on something personal. You ask...",
		options: [
			{
				id: "a",
				label: "The group chat (democracy)",
				weights: [
					2,
					0,
					1,
					0
				]
			},
			{
				id: "b",
				label: "One trusted human (precision)",
				weights: [
					-2,
					1,
					0,
					-1
				]
			},
			{
				id: "c",
				label: "The internet anonymously (bold)",
				weights: [
					1,
					-1,
					2,
					1
				]
			},
			{
				id: "d",
				label: "Nobody - I iterate in silence",
				weights: [
					-1,
					2,
					0,
					0
				]
			}
		]
	},
	{
		id: "q28",
		prompt: "Finally: this whole silly type quiz is basically...",
		options: [
			{
				id: "a",
				label: "A mirror with jokes",
				weights: [
					1,
					1,
					1,
					-1
				]
			},
			{
				id: "b",
				label: "A toy for thinking, not a diagnosis",
				weights: [
					-1,
					2,
					0,
					-2
				]
			},
			{
				id: "c",
				label: "A way to tag my chaos for science (not science)",
				weights: [
					1,
					-1,
					2,
					1
				]
			},
			{
				id: "d",
				label: "Fun - unless I'm losing, then it's rigged",
				weights: [
					2,
					-2,
					2,
					2
				]
			}
		]
	}
], Xt = {
	color: "var(--validation-survey-accent)",
	pale: "var(--validation-survey-soft)",
	ink: "var(--validation-survey-ink)"
}, Zt = [
	{
		id: "everyday",
		title: "Everyday Defaults",
		shortTitle: "Everyday Defaults",
		description: "See whether your persona knows the small preferences that quietly shape your day.",
		kind: "categorical",
		...Xt,
		questions: Kt
	},
	{
		id: "dials",
		title: "Personal Dials",
		shortTitle: "Personal Dials",
		description: "Compare degree, not just direction, across five everyday personality dimensions.",
		kind: "scale",
		...Xt,
		questions: qt
	},
	{
		id: "plot-twists",
		title: "Small Plot Twists",
		shortTitle: "Small Plot Twists",
		description: "Test how well your persona predicts what you do when ordinary plans go sideways.",
		kind: "categorical",
		...Xt,
		questions: Jt
	},
	{
		id: "internet-creature",
		title: "Internet Creature",
		shortTitle: "Internet Creature",
		description: "A full silly type quiz for finding out whether your persona shares your exact flavor of online chaos.",
		kind: "silly",
		...Xt,
		questions: Yt
	}
], Qt = Object.fromEntries(Zt.map((e) => [e.id, e])), $t = {
	planner: {
		name: "The Thoughtful Planner",
		description: "You feel best when the next step is visible."
	},
	comfort: {
		name: "The Comfort Curator",
		description: "You know which familiar things reliably make life better."
	},
	explorer: {
		name: "The Curious Explorer",
		description: "Novelty is usually worth the detour."
	},
	connector: {
		name: "The Social Connector",
		description: "Other people are part of how you choose and recharge."
	},
	improviser: {
		name: "The Easygoing Improviser",
		description: "You prefer enough structure to move, then adapt."
	},
	analyst: {
		name: "The Curious Analyst",
		description: "You orient yourself by understanding what is happening."
	},
	fixer: {
		name: "The Practical Fixer",
		description: "For you, action is often the fastest route to clarity."
	},
	collaborator: {
		name: "The Friendly Collaborator",
		description: "You naturally solve problems with other people."
	},
	adapter: {
		name: "The Flexible Adapter",
		description: "You stay light on your feet when circumstances change."
	},
	anchor: {
		name: "The Steady Anchor",
		description: "You reduce risk and make the next step feel manageable."
	}
}, en = {
	EOVA: {
		name: "Main Character Meteor",
		description: "Visible, organized, loud, and ready to debate the group chat into orbit."
	},
	EOVP: {
		name: "Friendly Raid Boss",
		description: "A high-energy organizer who would still like everyone to have a nice time."
	},
	EOMA: {
		name: "Drama Documentarian",
		description: "You arrive with receipts, a narrative arc, and excellent timing."
	},
	EOMP: {
		name: "Hype Librarian",
		description: "You bring the crowd together, then quietly catalog the lore."
	},
	ELVA: {
		name: "Chaos Goblin CEO",
		description: "Bold ideas, maximum volume, and a plan that appeared three seconds ago."
	},
	ELVP: {
		name: "Meme Syndicate Intern",
		description: "Socially fearless, delightfully scattered, and committed to keeping the vibe alive."
	},
	ELMA: {
		name: "Speedrun Poster",
		description: "Fast, improvisational, and somehow already replying before the thought finishes."
	},
	ELMP: {
		name: "Tab Hoarder Supreme",
		description: "A friendly browser tornado with seventeen interests and no desire for conflict."
	},
	IOVA: {
		name: "Soft Launch Strategist",
		description: "Quietly prepared, carefully visible, and more decisive than people expect."
	},
	IOVP: {
		name: "Quiet Brand Evangelist",
		description: "Measured, organized enthusiasm delivered to exactly the right audience."
	},
	IOMA: {
		name: "Cryptic Hint Machine",
		description: "Your restrained posts suggest there is a much larger document somewhere."
	},
	IOMP: {
		name: "Offline Sage",
		description: "Calm, deliberate, and likely to return with the one answer everyone needed."
	},
	ILVA: {
		name: "Precision Troll",
		description: "Low-profile chaos deployed with accuracy and absolutely no wasted motion."
	},
	ILVP: {
		name: "Lurker With Opinions",
		description: "You watch the whole timeline and save your best take for the safest room."
	},
	ILMA: {
		name: "Minimalist Menace",
		description: "Sparse words, surprising force, and a workflow only you understand."
	},
	ILMP: {
		name: "Void Enjoyer",
		description: "Peacefully unbothered, privately curious, and comfortable beyond the reach of notifications."
	}
}, tn = [
	{
		key: "e",
		low: "Inbox Hermit",
		high: "Extro-feed",
		lowLetter: "I",
		highLetter: "E"
	},
	{
		key: "o",
		low: "Loopcore",
		high: "Outline Brain",
		lowLetter: "L",
		highLetter: "O"
	},
	{
		key: "v",
		low: "Muted Lore",
		high: "Volume Poster",
		lowLetter: "M",
		highLetter: "V"
	},
	{
		key: "a",
		low: "Peace Treaty",
		high: "Attack-forward",
		lowLetter: "P",
		highLetter: "A"
	}
], nn = {
	structure: [
		"Flow-led",
		"Lightly planned",
		"Flexible middle",
		"Structured",
		"Plan-first"
	],
	"social-recharge": [
		"Solo recharger",
		"Mostly solo",
		"Depends on the day",
		"People-powered",
		"Highly social recharge"
	],
	novelty: [
		"Favorite keeper",
		"Familiarity-leaning",
		"Selective explorer",
		"Novelty-seeking",
		"Adventure-first"
	],
	"decision-speed": [
		"Deliberate",
		"Careful",
		"Context-dependent",
		"Quick",
		"Fast-moving"
	],
	expressiveness: [
		"Private processor",
		"Low-key",
		"Selectively open",
		"Expressive",
		"Open book"
	]
};
//#endregion
//#region lib/scoring.ts
function rn(e, t) {
	return e.options.find((e) => e.id === t);
}
function an(e, t) {
	return rn(e, t)?.label ?? "No answer";
}
function on(e, t) {
	let n = Array.from(new Set(e.questions.flatMap((e) => e.options.map((e) => e.category).filter(Boolean)))), r = Object.fromEntries(n.map((e) => [e, 0]));
	e.questions.forEach((e) => {
		let n = rn(e, t[e.id])?.category;
		n && (r[n] = (r[n] ?? 0) + 1);
	});
	let i = Math.max(...n.map((e) => r[e] ?? 0)), a = n.filter((e) => r[e] === i);
	return a.length >= 3 ? {
		kind: "categorical",
		title: "Balanced mix",
		description: "Your choices spread across several styles, with no single default taking over.",
		leaders: a,
		scores: r
	} : a.length === 2 ? {
		kind: "categorical",
		title: `${$t[a[0]].name} + ${$t[a[1]].name} blend`,
		description: `${$t[a[0]].description} ${$t[a[1]].description}`,
		leaders: a,
		scores: r
	} : {
		kind: "categorical",
		title: $t[a[0]].name,
		description: $t[a[0]].description,
		leaders: a,
		scores: r
	};
}
function sn(e, t) {
	let n = e.questions.map((e) => {
		let n = Number(rn(e, t[e.id])?.value ?? 3);
		return {
			id: e.id,
			dimension: e.dimension ?? e.id,
			value: n,
			label: nn[e.id][n - 1]
		};
	}), r = Math.max(...n.map((e) => Math.abs(e.value - 3)));
	if (r === 0) return {
		kind: "scale",
		title: "Balanced settings",
		values: n
	};
	let i = {
		structure: ["Go-with-the-flow", "Plan-first"],
		"social-recharge": ["Solo recharge", "People-powered"],
		novelty: ["Favorite keeper", "Adventure-first"],
		"decision-speed": ["Think-it-through", "Quick-decider"],
		expressiveness: ["Private processor", "Open book"]
	};
	return {
		kind: "scale",
		title: n.filter((e) => Math.abs(e.value - 3) === r).slice(0, 2).map((e) => i[e.id][e.value < 3 ? 0 : 1]).join(" + "),
		values: n
	};
}
function cn(e, t) {
	let n = [
		0,
		0,
		0,
		0
	];
	e.questions.forEach((e) => {
		(rn(e, t[e.id])?.weights ?? [
			0,
			0,
			0,
			0
		]).forEach((e, t) => {
			n[t] += e;
		});
	});
	let r = e.questions.length * 3, i = n.map((e) => Math.round(Math.max(0, Math.min(100, (e + r) / (2 * r) * 100)) * 10) / 10), a = i.map((e, t) => e >= 50 ? tn[t].highLetter : tn[t].lowLetter).join(""), o = en[a];
	return {
		kind: "silly",
		title: o.name,
		description: o.description,
		code: a,
		raw: n,
		scores: i
	};
}
function ln(e, t) {
	return e.kind === "categorical" ? on(e, t) : e.kind === "scale" ? sn(e, t) : cn(e, t);
}
function un(e, t) {
	return 1 - Array.from(new Set([...Object.keys(e.scores), ...Object.keys(t.scores)])).reduce((n, r) => n + Math.abs((e.scores[r] ?? 0) - (t.scores[r] ?? 0)), 0) / 10;
}
function dn(e, t, n) {
	let r = 0, i = 0, a = [], o = 0;
	e.questions.forEach((s) => {
		let c = t[s.id], l = n[s.id], u = c === l;
		if (u && (r += 1), e.kind === "scale") {
			let e = rn(s, c)?.value ?? 0, t = rn(s, l)?.value ?? 0, n = Math.abs(e - t);
			o += 1 - n / 4, n <= 1 && (i += 1), u || a.push({
				question: s,
				humanAnswer: `${e} - ${an(s, c)}`,
				personaAnswer: `${t} - ${an(s, l)}`,
				distance: n
			});
		} else o += +!!u, u || a.push({
			question: s,
			humanAnswer: an(s, c),
			personaAnswer: an(s, l)
		});
	});
	let s;
	if (e.kind === "categorical" && (s = un(ln(e, t), ln(e, n))), e.kind === "silly") {
		let r = ln(e, t), i = ln(e, n);
		s = r.scores.reduce((e, t, n) => e + (1 - Math.abs(t - i.scores[n]) / 100), 0) / r.scores.length;
	}
	return {
		similarity: o / e.questions.length,
		exactMatches: r,
		withinOne: e.kind === "scale" ? i : void 0,
		profileSimilarity: s,
		differences: a
	};
}
function fn(e) {
	return `${Math.round(e * 100)}%`;
}
//#endregion
//#region lib/history.ts
function pn(e) {
	return !!(e && typeof e == "object" && !Array.isArray(e));
}
function mn(e) {
	return typeof e == "string" && Number.isFinite(Date.parse(e)) ? e : void 0;
}
function hn(e) {
	return typeof e == "string" && e.trim() ? e : void 0;
}
function gn(e) {
	if (!pn(e)) return null;
	let t = hn(e.contextId), n = hn(e.personaId), r = hn(e.displayName), i = hn(e.baselineSha256), a = e.revisionSha256 === null ? null : hn(e.revisionSha256);
	return !t || !n || !r || !i || a === void 0 ? null : {
		contextId: t,
		personaId: n,
		displayName: r,
		baselineSha256: i,
		revisionSha256: a
	};
}
function _n(e, t) {
	if (!pn(t)) return {};
	let n = Qt[e];
	return Object.fromEntries(n.questions.flatMap((e) => {
		let n = t[e.id];
		return typeof n == "string" && e.options.some((e) => e.id === n) ? [[e.id, n]] : [];
	}));
}
function vn(e, t) {
	if (!Array.isArray(t)) return [];
	let n = new Set(Qt[e].questions.map((e) => e.id));
	return [...new Set(t.filter((e) => typeof e == "string" && n.has(e)))];
}
function yn(e, t) {
	return Qt[e].questions.every((e) => e.options.some((n) => n.id === t[e.id]));
}
function bn(e, t) {
	if (!pn(e) || !pn(e.answers)) return;
	let n = _n(t, e.answers), r = vn(t, e.clearedAnswers);
	r.forEach((e) => delete n[e]);
	let i = mn(e.completedAt);
	return {
		answers: n,
		clearedAnswers: r.length ? r : void 0,
		personaAgent: gn(e.personaAgent),
		completedAt: i && yn(t, n) ? i : void 0
	};
}
function xn(e, t) {
	let n = bn(e, t);
	if (!(!n || !pn(e))) return {
		...n,
		id: hn(e.id) ?? `recovered-human-${t}`,
		startedAt: mn(e.startedAt) ?? n.completedAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
	};
}
function Sn(e, t) {
	if (!pn(e)) return;
	let n = hn(e.id), r = mn(e.startedAt), i = e.responseIndex, a = e.responsesPerSurvey;
	if (!n || !r || typeof i != "number" || !Number.isInteger(i) || i <= 0 || typeof a != "number" || !Number.isInteger(a) || a <= 0 || a > 1e3 || i > a || !Array.isArray(e.surveyIds)) return;
	let o = new Set(Object.keys(Qt)), s = e.surveyIds.filter((e) => typeof e == "string" && o.has(e));
	if (!(s.length === 0 || s.length !== e.surveyIds.length || new Set(s).size !== s.length || !s.includes(t))) return {
		id: n,
		startedAt: r,
		responseIndex: i,
		responsesPerSurvey: a,
		surveyIds: s
	};
}
function Cn(e, t, n) {
	let r = bn(e, t);
	if (!r || !pn(e)) return;
	let i = typeof e.dimensionCount == "number" && Number.isInteger(e.dimensionCount) && e.dimensionCount >= 0 && e.dimensionCount <= 9999 ? e.dimensionCount : null;
	return {
		...r,
		id: hn(e.id) ?? `recovered-agent-${n}`,
		sequence: typeof e.sequence == "number" && Number.isInteger(e.sequence) && e.sequence > 0 ? e.sequence : n,
		dimensionCount: i,
		startedAt: mn(e.startedAt) ?? r.completedAt ?? (/* @__PURE__ */ new Date(0)).toISOString(),
		freshSessionAttestedAt: mn(e.freshSessionAttestedAt) ?? mn(e.isolationConfirmedAt) ?? null,
		benchmarkId: hn(e.benchmarkId) ?? null,
		experiment: Sn(e.experiment, t),
		migrated: e.migrated === !0
	};
}
function wn(e, t) {
	let n = /* @__PURE__ */ new Set(), r = /* @__PURE__ */ new Set(), i = e.map((e, n) => Cn(e, t, n + 1)).filter((e) => !!e).map((e, t) => {
		let i = e.id;
		for (; n.has(i);) i = `${e.id}-${t + 1}`;
		n.add(i);
		let a = e.sequence;
		for (; r.has(a);) a += 1;
		return r.add(a), {
			...e,
			id: i,
			sequence: a
		};
	}), a = i.filter((e) => !e.completedAt && e.dimensionCount !== null && !!e.freshSessionAttestedAt).at(-1), o = [...i].reverse().find((e) => !e.completedAt && e.id !== a?.id);
	return {
		runs: i.filter((e) => !!e.completedAt || e.id === a?.id),
		recoveredDraft: o ? {
			answers: o.answers,
			personaAgent: o.personaAgent
		} : void 0
	};
}
function Tn(e, t) {
	let n = /* @__PURE__ */ new Map();
	return Array.isArray(e) && e.forEach((e) => {
		if (!pn(e)) return;
		let t = hn(e.id), r = mn(e.deletedAt);
		if (!t || !r) return;
		let i = n.get(t);
		(!i || r < i.deletedAt) && n.set(t, {
			id: t,
			deletedAt: r
		});
	}), Array.isArray(t) && t.forEach((e) => {
		let t = hn(e);
		t && !n.has(t) && n.set(t, {
			id: t,
			deletedAt: (/* @__PURE__ */ new Date(0)).toISOString()
		});
	}), [...n.values()];
}
function En(e, t) {
	return t ? !e.completedAt || t.deletedAt < e.completedAt : !1;
}
function Dn(e) {
	if (!pn(e) || e.version !== 2 || !pn(e.surveys)) return null;
	let t = e.surveys, n = {};
	return Object.keys(Qt).forEach((e) => {
		let r = t[e];
		if (!pn(r)) return;
		let i = wn(Array.isArray(r.agentRuns) ? r.agentRuns : [], e), a = Tn(r.deletedAgentRuns, r.deletedAgentRunIds), o = new Map(a.map((e) => [e.id, e]));
		n[e] = {
			human: xn(r.human, e),
			agentRuns: i.runs.filter((e) => !En(e, o.get(e.id))),
			recoveredLegacyDraft: bn(r.recoveredLegacyDraft, e) ?? i.recoveredDraft,
			generation: typeof r.generation == "number" && Number.isInteger(r.generation) && r.generation >= 0 ? r.generation : 0,
			deletedAgentRuns: a
		};
	}), n;
}
function On(e) {
	if (!pn(e)) return null;
	let t = e, n = {};
	return Object.keys(Qt).forEach((e) => {
		let r = t[e];
		if (!pn(r)) return;
		let i = bn(r.human, e), a = bn(r.persona, e), o = i ? {
			...i,
			id: `migrated-human-${e}`,
			startedAt: i.completedAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
		} : void 0, s = a?.completedAt ? a : void 0;
		n[e] = {
			human: o,
			agentRuns: s ? [{
				...s,
				id: `migrated-agent-${e}-1`,
				sequence: 1,
				dimensionCount: null,
				startedAt: s.completedAt,
				freshSessionAttestedAt: null,
				benchmarkId: o?.completedAt ? o.id : null,
				migrated: !0
			}] : [],
			recoveredLegacyDraft: a && !a.completedAt ? a : void 0,
			generation: 0,
			deletedAgentRuns: []
		};
	}), n;
}
function kn(e, t) {
	let n;
	if (e) try {
		let t = Dn(JSON.parse(e));
		if (t) return {
			store: t,
			source: "v2"
		};
		n = e;
	} catch {
		n = e;
	}
	if (t) try {
		let e = On(JSON.parse(t));
		if (e) return {
			store: e,
			source: "legacy",
			warning: n ? "The newer local record was invalid. A backup was kept and the earlier record was recovered." : void 0,
			invalidV2Text: n
		};
	} catch {}
	return {
		store: {},
		source: "empty",
		warning: n ? "The local results record was invalid. It was backed up and left untouched until you save new answers." : t ? "The earlier local results record could not be read. It was left untouched." : void 0,
		invalidV2Text: n
	};
}
function An(e) {
	return JSON.stringify({
		version: 2,
		surveys: e,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	});
}
function jn(e, t) {
	return e ?? t;
}
function Mn(e, t) {
	let n = {
		...e.answers,
		...t.answers
	}, r = new Set(e.clearedAnswers ?? []);
	return Object.keys(t.answers).forEach((e) => {
		r.delete(e);
	}), (t.clearedAnswers ?? []).forEach((e) => {
		delete n[e], r.add(e);
	}), r.forEach((e) => delete n[e]), {
		answers: n,
		clearedAnswers: r.size ? [...r] : void 0
	};
}
function Nn(e, t) {
	return { experiment: e.experiment ?? t.experiment };
}
function Pn(e, t) {
	return e ? t ? e.id === t.id ? e.completedAt ? {
		...e,
		personaAgent: jn(e.personaAgent, t.personaAgent)
	} : t.completedAt ? {
		...t,
		id: e.id,
		startedAt: e.startedAt,
		personaAgent: jn(e.personaAgent, t.personaAgent)
	} : {
		...e,
		...t,
		id: e.id,
		...Mn(e, t),
		startedAt: e.startedAt,
		personaAgent: jn(e.personaAgent, t.personaAgent)
	} : t : e : t;
}
function Fn(e, t) {
	let n = e.map((e) => ({
		...e,
		answers: { ...e.answers },
		clearedAnswers: e.clearedAnswers ? [...e.clearedAnswers] : void 0
	})), r = new Set(n.map((e) => e.sequence));
	return t.forEach((e) => {
		let t = n.findIndex((t) => t.id === e.id);
		if (t >= 0) {
			let r = n[t];
			if (r.completedAt) {
				let i = jn(r.personaAgent, e.personaAgent), a = Nn(r, e);
				r.benchmarkId === null && !r.migrated && e.benchmarkId ? n[t] = {
					...r,
					benchmarkId: e.benchmarkId,
					personaAgent: i,
					...a
				} : (i !== r.personaAgent || a.experiment !== r.experiment) && (n[t] = {
					...r,
					personaAgent: i,
					...a
				});
				return;
			}
			if (e.completedAt) {
				n[t] = {
					...e,
					id: r.id,
					sequence: r.sequence,
					dimensionCount: r.dimensionCount,
					startedAt: r.startedAt,
					freshSessionAttestedAt: r.freshSessionAttestedAt ?? e.freshSessionAttestedAt,
					benchmarkId: r.benchmarkId ?? (r.migrated ? null : e.benchmarkId),
					personaAgent: jn(r.personaAgent, e.personaAgent),
					...Nn(r, e),
					answers: { ...e.answers }
				};
				return;
			}
			n[t] = {
				...r,
				...e,
				id: r.id,
				sequence: r.sequence,
				dimensionCount: r.dimensionCount,
				startedAt: r.startedAt,
				freshSessionAttestedAt: r.freshSessionAttestedAt ?? e.freshSessionAttestedAt,
				benchmarkId: r.benchmarkId ?? (r.migrated ? null : e.benchmarkId),
				personaAgent: jn(r.personaAgent, e.personaAgent),
				...Nn(r, e),
				...Mn(r, e)
			};
			return;
		}
		let i = e.sequence;
		for (; r.has(i);) i += 1;
		r.add(i), n.push({
			...e,
			sequence: i,
			answers: { ...e.answers },
			clearedAnswers: e.clearedAnswers ? [...e.clearedAnswers] : void 0
		});
	}), n;
}
function In(e, t) {
	let n = {};
	return Object.keys(Qt).forEach((r) => {
		let i = e[r], a = t[r];
		if (!i && !a) return;
		if (!i) {
			n[r] = a;
			return;
		}
		if (!a) {
			n[r] = i;
			return;
		}
		let o = i.generation ?? 0, s = a.generation ?? 0;
		if (o !== s) {
			n[r] = o > s ? i : a;
			return;
		}
		let c = i?.recoveredLegacyDraft, l = a?.recoveredLegacyDraft, u = /* @__PURE__ */ new Map();
		[...i.deletedAgentRuns ?? [], ...a.deletedAgentRuns ?? []].forEach((e) => {
			let t = u.get(e.id);
			(!t || e.deletedAt < t.deletedAt) && u.set(e.id, e);
		});
		let d = [...u.values()];
		n[r] = {
			human: Pn(i?.human, a?.human),
			agentRuns: Fn(i?.agentRuns ?? [], a?.agentRuns ?? []).filter((e) => !En(e, u.get(e.id))),
			recoveredLegacyDraft: c || l ? {
				...c ?? l,
				...c && l ? Mn(c, l) : {},
				completedAt: c?.completedAt ?? l?.completedAt,
				personaAgent: jn(c?.personaAgent ?? null, l?.personaAgent ?? null)
			} : void 0,
			generation: o,
			deletedAgentRuns: d
		};
	}), n;
}
function Ln(e, t) {
	return e[t] ?? {
		agentRuns: [],
		generation: 0,
		deletedAgentRuns: []
	};
}
function Rn(e, t) {
	let n = e.human?.personaAgent;
	return e.agentRuns.filter((e) => !!e.completedAt && (!n || !e.personaAgent || e.personaAgent.contextId === n.contextId) && (t === void 0 || e.benchmarkId === t));
}
function zn(e, t) {
	return [...e.agentRuns].reverse().find((e) => !e.completedAt && e.dimensionCount !== null && !!e.freshSessionAttestedAt && (t === void 0 || e.benchmarkId === t));
}
function Bn(e, t) {
	return e.agentRuns.find((e) => e.id === t);
}
function Vn(e, t) {
	let n = e.human?.personaAgent, r = !1, i = e.agentRuns.map((e) => e.benchmarkId !== null || e.migrated || n && e.personaAgent && n.contextId !== e.personaAgent.contextId ? e : (r = !0, {
		...e,
		benchmarkId: t
	}));
	return r ? {
		...e,
		agentRuns: i
	} : e;
}
function Hn(e, t) {
	return Object.fromEntries(Object.entries(e).map(([e, n]) => n ? [e, {
		...n,
		human: n.human ? {
			...n.human,
			personaAgent: n.human.personaAgent ?? t
		} : void 0,
		agentRuns: n.agentRuns.map((e) => ({
			...e,
			personaAgent: e.personaAgent ?? t
		})),
		recoveredLegacyDraft: n.recoveredLegacyDraft ? {
			...n.recoveredLegacyDraft,
			personaAgent: n.recoveredLegacyDraft.personaAgent ?? t
		} : void 0
	}] : [e, n]));
}
function Un(e, t) {
	if (!t.human?.completedAt) return [];
	let n = Qt[e];
	return Rn(t, t.human.id).filter((e) => !!(e.completedAt && e.dimensionCount !== null)).map((e) => {
		let r = dn(n, t.human.answers, e.answers);
		return {
			runId: e.id,
			sequence: e.sequence,
			dimensionCount: e.dimensionCount,
			similarity: r.similarity,
			exactMatches: r.exactMatches,
			completedAt: e.completedAt
		};
	}).sort((e, t) => Date.parse(e.completedAt) - Date.parse(t.completedAt) || e.sequence - t.sequence);
}
function Wn(e) {
	return [...new Set(e.map((e) => e.dimensionCount))].sort((e, t) => e - t).map((t) => {
		let n = e.filter((e) => e.dimensionCount === t);
		return {
			dimensionCount: t,
			similarity: n.reduce((e, t) => e + t.similarity, 0) / n.length
		};
	});
}
function Gn(e) {
	if (e.length === 0) return {
		title: "No measured Agent runs yet",
		detail: "Complete an Agent run with a recorded dimension count to start the convergence view."
	};
	if (e.length === 1) return {
		title: "One measured run",
		detail: "Complete another run at a different persona-detail level to see whether similarity changes."
	};
	let t = Wn(e);
	if (t.length === 1) return {
		title: "Same detail level so far",
		detail: `All measured runs used ${t[0].dimensionCount} persona dimensions. Try another dimension count to test convergence.`
	};
	let n = t[0], r = t.at(-1), i = Math.round((r.similarity - n.similarity) * 100), a = t.slice(1).map((e, n) => e.similarity - t[n].similarity), o = a.some((e) => e > .005) && a.some((e) => e < -.005);
	return {
		title: `Similarity ${Math.abs(i) <= 1 ? "held steady" : i > 0 ? `rose by ${i} points` : `fell by ${Math.abs(i)} points`}`,
		detail: `Average similarity at ${n.dimensionCount} persona dimensions is ${Math.round(n.similarity * 100)}%, compared with ${Math.round(r.similarity * 100)}% at ${r.dimensionCount}.${o ? " The path across recorded depths was uneven." : ""} This is descriptive, not proof that added dimensions caused the change.`
	};
}
//#endregion
//#region lib/validation-bridge.ts
var Kn = "matraix-validation", qn = typeof window > "u" ? "http://127.0.0.1:8766" : window.location.origin, Jn = "matraix-validation-command", Yn = "matraix-validation-state";
function Xn(e) {
	return !!(e && typeof e == "object" && !Array.isArray(e));
}
function Zn(e) {
	return typeof e == "string" && e in Qt;
}
function Qn(e) {
	return Xn(e) && e.channel === "matraix-validation" && e.version === 1 && e.type === "request-state";
}
function $n(e) {
	return Xn(e) && e.channel === "matraix-validation" && e.version === 1 && e.type === "run-agent-batch";
}
function er(e) {
	return Xn(e) && e.channel === "matraix-validation" && e.version === 1 && e.type === "host-layout" && [
		"wide",
		"medium",
		"compact"
	].includes(String(e.viewport));
}
function tr(e) {
	if (!Xn(e) || e.channel !== "matraix-validation" || e.version !== 1 || e.type !== "navigate" || !Xn(e.target)) return !1;
	let t = e.target.name;
	return [
		"home",
		"human",
		"agent",
		"history"
	].includes(String(t)) ? t === "home" || Zn(e.target.surveyId) : !1;
}
function nr(e, t, n = {
	active: !1,
	ready: !1
}) {
	let r = Zt.map((t) => {
		let n = Ln(e, t.id), r = Object.keys(n.human?.answers ?? {}).length, i = zn(n);
		return {
			id: t.id,
			title: t.title,
			humanStatus: n.human?.completedAt ? "complete" : r > 0 ? "in-progress" : "not-started",
			humanAnswered: r,
			questionCount: t.questions.length,
			agentDraftAnswered: i ? Object.keys(i.answers).length : null,
			completedAgentRuns: Rn(n).length
		};
	}), i;
	if (t.name === "quiz" && t.surveyId && t.runId) {
		let n = Ln(e, t.surveyId), r = t.actor === "agent" ? Bn(n, t.runId) : n.human?.id === t.runId ? n.human : void 0;
		r && (i = {
			answered: Object.keys(r.answers).length,
			total: Qt[t.surveyId].questions.length
		});
	}
	return {
		view: t.name,
		activeSurveyId: t.surveyId,
		activeActor: t.actor,
		activeProgress: i,
		agentBatchActive: n.active,
		agentBatchControllerReady: n.ready,
		totals: {
			completedBenchmarks: r.filter((e) => e.humanStatus === "complete").length,
			completedAgentRuns: r.reduce((e, t) => e + t.completedAgentRuns, 0)
		},
		surveys: r
	};
}
function rr(e, t, n) {
	return {
		channel: Kn,
		version: 1,
		type: "state",
		state: nr(e, t, n)
	};
}
//#endregion
//#region lib/validation-persistence.ts
var ir = `${qn}/api/validation/state`;
function ar(e) {
	return !!(e && typeof e == "object" && !Array.isArray(e));
}
function or(e) {
	return ar(e) ? ar(e.state) ? e.state : ar(e.current) ? e.current : ar(e.validation_state) ? e.validation_state : e : e;
}
function sr(e) {
	let t = or(e);
	if (!ar(t)) throw Error("The Validation state response was not an object.");
	let n = t.schema_version, r = t.context_id, i = t.persona_id, a = t.persona_display_name, o = t.baseline_sha256, s = t.persona_revision, c = t.persona_dimension_count, l = t.save_revision, u = t.saved_at, d = kn(ar(t.store) ? JSON.stringify(t.store) : null, null);
	if (n !== 1 || typeof r != "string" || !r.trim() || typeof i != "string" || !i.trim() || typeof a != "string" || !a.trim() || typeof o != "string" || !o.trim() || typeof s != "string" || !s.trim() || typeof c != "number" || !Number.isInteger(c) || c < 0 || c > 9999 || typeof l != "number" || !Number.isInteger(l) || l < 0 || !(u === null || typeof u == "string") || u !== null && !Number.isFinite(Date.parse(u)) || d.source !== "v2") throw Error("The Validation state response had an invalid shape.");
	let f = {
		contextId: r,
		personaId: i,
		displayName: a,
		baselineSha256: o,
		revisionSha256: s
	};
	return {
		schemaVersion: 1,
		contextId: r,
		personaId: i,
		personaDisplayName: a,
		baselineSha256: o,
		personaRevision: s,
		personaDimensionCount: c,
		personaAgent: f,
		saveRevision: l,
		savedAt: u,
		store: Hn(d.store, {
			...f,
			revisionSha256: null
		})
	};
}
function cr(e) {
	if (ar(e)) {
		if (typeof e.code == "string") return e.code;
		if (ar(e.error) && typeof e.error.code == "string") return e.error.code;
		if (typeof e.error == "string") return e.error;
	}
}
function lr(e, t) {
	return ar(e) ? typeof e.message == "string" && e.message.trim() ? e.message : typeof e.error == "string" && e.error.trim() ? e.error : ar(e.error) && typeof e.error.message == "string" ? e.error.message : t : t;
}
var ur = class extends Error {
	constructor(e, t, n, r) {
		super(e), this.name = "ValidationPersistenceError", this.status = t, this.code = n, this.currentState = r;
	}
};
async function dr(e) {
	let t = await e.text();
	if (!t) return null;
	try {
		return JSON.parse(t);
	} catch {
		throw new ur("The Validation persistence service returned invalid JSON.", e.status);
	}
}
function fr(e) {
	return JSON.parse(An(e));
}
async function pr(e = fetch) {
	let t = await e(ir, {
		method: "GET",
		headers: { Accept: "application/json" },
		cache: "no-store",
		credentials: "omit"
	}), n = await dr(t);
	if (!t.ok) throw new ur(lr(n, "Validation results could not be loaded from disk."), t.status, cr(n));
	return sr(n);
}
async function mr(e, t, n, r = fetch) {
	let i = await r(ir, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json"
		},
		cache: "no-store",
		credentials: "omit",
		body: JSON.stringify({
			context_id: e,
			expected_save_revision: t,
			store: fr(n)
		})
	}), a = await dr(i);
	if (!i.ok) {
		let e;
		if (i.status === 409) try {
			e = sr(a);
		} catch {}
		throw new ur(lr(a, "Validation results could not be saved to disk."), i.status, cr(a), e);
	}
	return sr(a);
}
function hr(e) {
	return !(e instanceof ur) || e.status === 408 || e.status === 429 || e.status >= 500;
}
async function gr(e, t, n, r = fetch, i = (e) => new Promise((t) => setTimeout(t, e))) {
	try {
		return await mr(e, t, n, r);
	} catch (a) {
		if (!hr(a)) throw a;
		return await i(650), mr(e, t, n, r);
	}
}
function _r(e) {
	return JSON.stringify(e);
}
`${qn}`;
var vr = `${qn}/api/validation/agent-batch`;
function yr(e) {
	return !!(e && typeof e == "object" && !Array.isArray(e));
}
function br(e) {
	return typeof e == "string" && e.trim() ? e : void 0;
}
function xr(e) {
	return typeof e == "string" && Number.isFinite(Date.parse(e)) ? e : void 0;
}
function Sr(e) {
	return yr(e) && typeof e.code == "string" ? e.code : void 0;
}
function Cr(e, t) {
	return yr(e) ? typeof e.error == "string" && e.error.trim() ? e.error : typeof e.message == "string" && e.message.trim() ? e.message : t : t;
}
var wr = class extends Error {
	constructor(e, t, n) {
		super(e), this.name = "ValidationAgentError", this.status = t, this.code = n;
	}
};
async function Tr(e) {
	let t = await e.text();
	if (!t) return null;
	try {
		return JSON.parse(t);
	} catch {
		throw new wr("The Agent service returned invalid JSON.", e.status);
	}
}
function Er(e, t, n, r) {
	if (!yr(e) || e.ok !== !0 || e.survey_id !== t.id) throw Error("The Agent result had an invalid response shape.");
	let i = br(e.context_id), a = br(e.persona_id), o = br(e.persona_display_name), s = br(e.baseline_sha256), c = br(e.persona_revision), l = e.persona_dimension_count, u = br(e.model), d = br(e.reasoning_effort), f = xr(e.started_at), p = xr(e.completed_at), m = yr(e.execution) ? e.execution : null, h = yr(e.answers) ? e.answers : null;
	if (i !== n || c !== r || !a || !o || !s || typeof l != "number" || !Number.isInteger(l) || l < 0 || l > 9999 || !u || !d || !f || !p || !m || m.mode !== "codex-ephemeral" || m.prior_conversation_messages !== 0 || m.memory !== "disabled" || m.tools !== "disabled" || !h) throw Error("The Agent result did not prove a clean persona run.");
	let g = new Set(t.questions.map((e) => e.id));
	if (Object.keys(h).length !== g.size || Object.keys(h).some((e) => !g.has(e))) throw Error("The Agent result did not answer every survey question.");
	let _ = {};
	return t.questions.forEach((e) => {
		let t = h[e.id];
		if (typeof t != "string" || !e.options.some((e) => e.id === t)) throw Error("The Agent result selected an unknown survey option.");
		_[e.id] = t;
	}), {
		surveyId: t.id,
		answers: _,
		personaAgent: {
			contextId: i,
			personaId: a,
			displayName: o,
			baselineSha256: s,
			revisionSha256: c
		},
		dimensionCount: l,
		model: u,
		reasoningEffort: d,
		startedAt: f,
		completedAt: p,
		executionMode: "codex-ephemeral"
	};
}
var Dr = new Set([
	"agent_timeout",
	"invalid_agent_output",
	"agent_unavailable",
	"agent_failed",
	"agent_interrupted"
]);
function Or(e, t, n, r) {
	if (!yr(e) || e.ok !== !0) throw Error("The Agent batch had an invalid response shape.");
	let i = br(e.batch_id), a = br(e.context_id), o = br(e.persona_revision), s = e.persona_dimension_count, c = e.runs_per_survey, l = e.survey_count, u = e.requested_runs, d = e.succeeded_runs, f = e.failed_runs, p = xr(e.started_at), m = xr(e.completed_at), h = Array.isArray(e.results) ? e.results : null, g = t.length * 10;
	if (!i || a !== n || o !== r || typeof s != "number" || !Number.isInteger(s) || s < 0 || s > 9999 || c !== 10 || l !== t.length || u !== g || !p || !m || !h || h.length !== g) throw Error("The Agent batch did not match the requested experiment.");
	let _ = h.map((e, i) => {
		if (!yr(e)) throw Error("The Agent batch contained an invalid result entry.");
		let a = t[Math.floor(i / 10)], o = i % 10 + 1;
		if (!a || e.survey_id !== a.id || e.response_index !== o) throw Error("The Agent batch results were not in stable order.");
		if (e.ok === !0) {
			let t = Er(e, a, n, r);
			if (t.dimensionCount !== s) throw Error("The Agent batch mixed persona dimension counts.");
			return {
				...t,
				ok: !0,
				responseIndex: o
			};
		}
		let c = br(e.code), l = br(e.error), u = xr(e.started_at), d = xr(e.completed_at);
		if (e.ok !== !1 || !c || !Dr.has(c) || !l || !u || !d) throw Error("The Agent batch contained an invalid failure entry.");
		return {
			ok: !1,
			surveyId: a.id,
			responseIndex: o,
			code: c,
			message: l,
			startedAt: u,
			completedAt: d
		};
	}), v = _.filter((e) => e.ok), y = _.filter((e) => !e.ok);
	if (d !== v.length || f !== y.length) throw Error("The Agent batch result counts were inconsistent.");
	return {
		batchId: i,
		contextId: a,
		personaRevision: o,
		dimensionCount: s,
		runsPerSurvey: 10,
		startedAt: p,
		completedAt: m,
		results: _,
		successes: v,
		failures: y
	};
}
function kr(e, t, n, r) {
	if (!yr(e)) throw Error("The Agent batch status was not an object.");
	let i = br(e.batch_id), a = e.status, o = br(e.context_id), s = br(e.persona_revision), c = e.persona_dimension_count, l = e.runs_per_survey, u = e.requested_runs, d = e.completed_runs, f = e.succeeded_runs, p = e.failed_runs, m = xr(e.started_at), h = e.completed_at === null ? null : xr(e.completed_at), g = t.length * 10;
	if (!i || !/^validation-batch-[0-9a-f]{24}$/.test(i) || ![
		"running",
		"complete",
		"failed"
	].includes(String(a)) || o !== n || !s || r !== void 0 && s !== r || typeof c != "number" || !Number.isInteger(c) || c < 0 || c > 9999 || l !== 10 || u !== g || typeof d != "number" || !Number.isInteger(d) || d < 0 || d > g || typeof f != "number" || !Number.isInteger(f) || f < 0 || typeof p != "number" || !Number.isInteger(p) || p < 0 || f + p !== d || !m || a === "running" && h !== null || a !== "running" && !h) throw Error("The Agent batch status had an invalid shape.");
	let _;
	a === "complete" && Array.isArray(e.results) && (_ = Or(e, t, n, s));
	let v = br(e.code), y = br(e.error);
	if (a === "failed" && (!v || !y)) throw Error("The failed Agent batch did not include a safe error.");
	return {
		batchId: i,
		status: a,
		contextId: o,
		personaRevision: s,
		dimensionCount: c,
		runsPerSurvey: 10,
		requestedRuns: u,
		completedRuns: d,
		succeededRuns: f,
		failedRuns: p,
		startedAt: m,
		completedAt: h ?? null,
		code: v,
		message: y,
		result: _
	};
}
function Ar(e) {
	let t = new URL(vr);
	return t.searchParams.set("batch_id", e), t;
}
async function jr(e, t, n, r, i = fetch) {
	let a = await i(Ar(e), {
		method: "GET",
		headers: { Accept: "application/json" },
		cache: "no-store",
		credentials: "omit"
	}), o = await Tr(a);
	if (!a.ok) throw new wr(Cr(o, "The Agent batch status could not be loaded."), a.status, Sr(o));
	try {
		return kr(o, t, n, r);
	} catch (e) {
		throw new wr(e instanceof Error ? e.message : "The Agent batch status could not be validated.", a.status, "invalid_agent_batch_status");
	}
}
async function Mr(e, t, n = fetch) {
	let r = await n(vr, {
		method: "GET",
		headers: { Accept: "application/json" },
		cache: "no-store",
		credentials: "omit"
	}), i = await Tr(r);
	if (!r.ok) throw new wr(Cr(i, "Pending Agent batches could not be loaded."), r.status, Sr(i));
	if (!yr(i) || i.ok !== !0 || i.context_id !== t || !Array.isArray(i.batches)) throw new wr("The pending Agent batch list had an invalid shape.", r.status, "invalid_agent_batch_list");
	try {
		return i.batches.map((n) => kr(n, e, t));
	} catch (e) {
		throw new wr(e instanceof Error ? e.message : "The pending Agent batches could not be validated.", r.status, "invalid_agent_batch_list");
	}
}
async function Nr(e, t, n = fetch, r = (e) => new Promise((t) => setTimeout(t, e)), i) {
	let a = e;
	for (; a.status === "running" || !a.result;) {
		if (a.status === "failed") throw new wr(a.message ?? "The Agent batch failed.", 409, a.code);
		if (i?.(a), a.status === "complete" && !a.result) {
			a = await jr(a.batchId, t, a.contextId, a.personaRevision, n);
			continue;
		}
		await r(1e3), a = await jr(a.batchId, t, a.contextId, a.personaRevision, n);
	}
	return i?.(a), a.result;
}
async function Pr(e, t, n, r = fetch, i = (e) => new Promise((t) => setTimeout(t, e)), a) {
	let o = await r(vr, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json"
		},
		cache: "no-store",
		credentials: "omit",
		body: JSON.stringify({
			context_id: t,
			persona_revision: n,
			runs_per_survey: 10
		})
	}), s = await Tr(o);
	if (!o.ok) throw new wr(Cr(s, "The Agent batch could not be completed."), o.status, Sr(s));
	try {
		return yr(s) && s.status === void 0 ? Or(s, e, t, n) : Nr(kr(s, e, t, n), e, r, i, a);
	} catch (e) {
		throw e instanceof wr ? e : new wr(e instanceof Error ? e.message : "The Agent batch could not be validated.", o.status, "invalid_agent_batch_result");
	}
}
//#endregion
//#region lib/validation-batch-store.ts
function Fr(e, t, n) {
	return `agent-${e}-${t}-${n}`;
}
function Ir(e, t) {
	if (!t.has(e)) return e;
	let n = 2;
	for (; t.has(`${e}-${n}`);) n += 1;
	return `${e}-${n}`;
}
function Lr(e, t) {
	return e.surveyId === t;
}
function Rr(e, t, n) {
	let r = n.map((e) => e.id), i = e;
	return n.forEach((n) => {
		let a = Ln(e, n.id), o = t.successes.filter((e) => Lr(e, n.id)).sort((e, t) => e.responseIndex - t.responseIndex);
		if (!o.length) return;
		let s = [...a.agentRuns], c = new Set(s.map((e) => e.id)), l = new Set((a.deletedAgentRuns ?? []).map((e) => e.id)), u = new Set(s.map((e) => e.sequence)), d = Math.max(0, ...u), f = a.human?.completedAt ? a.human.id : null, p = !1;
		o.forEach((e) => {
			let i = Fr(t.batchId, n.id, e.responseIndex);
			if (s.some((n) => n.experiment?.id === t.batchId && n.experiment.responseIndex === e.responseIndex) || l.has(i)) return;
			let a = Ir(i, c), o = d + e.responseIndex;
			for (; u.has(o);) o += 1;
			let m = {
				id: a,
				sequence: o,
				dimensionCount: e.dimensionCount,
				answers: { ...e.answers },
				startedAt: e.startedAt,
				completedAt: e.completedAt,
				freshSessionAttestedAt: e.startedAt,
				benchmarkId: f,
				personaAgent: { ...e.personaAgent },
				experiment: {
					id: t.batchId,
					startedAt: t.startedAt,
					responseIndex: e.responseIndex,
					responsesPerSurvey: t.runsPerSurvey,
					surveyIds: [...r]
				}
			};
			c.add(a), u.add(o), s.push(m), p = !0;
		}), p && (i === e && (i = { ...e }), i[n.id] = {
			...a,
			agentRuns: s
		});
	}), i;
}
//#endregion
//#region lib/validation-results.ts
function zr(e) {
	return !e || e.completedRuns >= e.expectedRuns ? null : `Only ${e.completedRuns} of ${e.expectedRuns} Agent responses finished successfully.`;
}
function Br(e) {
	return !!e.completedAt;
}
function Vr(e) {
	return e.personaAgent?.contextId ?? "unknown-persona";
}
function Hr(e) {
	return [...e].sort((e, t) => (e.experiment?.responseIndex ?? e.sequence) - (t.experiment?.responseIndex ?? t.sequence) || Date.parse(e.completedAt ?? e.startedAt) - Date.parse(t.completedAt ?? t.startedAt) || e.id.localeCompare(t.id));
}
function Ur(e) {
	return `${Vr(e)}\u0000${e.dimensionCount ?? "unknown"}\u0000${e.experiment.id}`;
}
function Wr(e, t, n) {
	e[t] = [...e[t] ?? [], n];
}
function Gr(e) {
	let t = /* @__PURE__ */ new Map();
	return Zt.forEach((n) => {
		(e[n.id]?.agentRuns ?? []).filter((e) => Br(e) && !!e.experiment).forEach((e) => {
			let r = e.experiment, i = Ur(e), a = t.get(i);
			a || (a = {
				id: r.id,
				dimensionCount: e.dimensionCount,
				personaContextId: Vr(e),
				startedAt: r.startedAt,
				expectedRuns: r.responsesPerSurvey * r.surveyIds.length,
				runsBySurvey: {},
				responsesPerSurvey: r.responsesPerSurvey,
				surveyIds: r.surveyIds
			}, t.set(i, a)), !(r.startedAt !== a.startedAt || r.responsesPerSurvey !== a.responsesPerSurvey || r.surveyIds.length !== a.surveyIds.length || r.surveyIds.some((e, t) => e !== a.surveyIds[t])) && ((a.runsBySurvey[n.id] ?? []).some((e) => e.experiment?.responseIndex === r.responseIndex) || Wr(a.runsBySurvey, n.id, e));
		});
	}), [...t.values()];
}
function Kr(e) {
	let t = [];
	return Zt.forEach((n) => {
		(e[n.id]?.agentRuns ?? []).filter((e) => Br(e) && !e.experiment).forEach((e) => {
			t.push({
				id: `legacy:${n.id}:${e.id}`,
				dimensionCount: e.dimensionCount,
				personaContextId: Vr(e),
				startedAt: e.completedAt ?? e.startedAt,
				expectedRuns: 1,
				runsBySurvey: { [n.id]: [e] },
				responsesPerSurvey: 1,
				surveyIds: [n.id]
			});
		});
	}), t;
}
function qr(e) {
	return Object.values(e.runsBySurvey).reduce((e, t) => e + (t?.length ?? 0), 0);
}
function Jr(e, t) {
	let n = e === null ? "Unknown dimensions" : `${e} dim`;
	return t === 1 ? n : `${n}, #${t}`;
}
function Yr(e) {
	let t = [...Gr(e), ...Kr(e)].sort((e, t) => Date.parse(e.startedAt) - Date.parse(t.startedAt) || e.id.localeCompare(t.id)), n = /* @__PURE__ */ new Map();
	return t.map((e) => {
		let t = `${e.personaContextId}\u0000${e.dimensionCount ?? "unknown"}`, r = (n.get(t) ?? 0) + 1;
		n.set(t, r);
		let i = qr(e);
		return {
			id: e.id,
			label: Jr(e.dimensionCount, r),
			dimensionCount: e.dimensionCount,
			startedAt: e.startedAt,
			completedRuns: i,
			expectedRuns: e.expectedRuns,
			status: i >= e.expectedRuns ? "complete" : "partial",
			runsBySurvey: Object.fromEntries(Object.entries(e.runsBySurvey).map(([e, t]) => [e, Hr(t ?? [])]))
		};
	}).reverse();
}
function Xr(e, t) {
	return e.options.find((e) => e.id === t)?.value;
}
function Zr(e, t, n, r) {
	if (e.kind !== "scale") return +(n === r);
	let i = Xr(t, n), a = Xr(t, r);
	return i === void 0 || a === void 0 ? null : Math.max(0, 1 - Math.abs(i - a) / 4);
}
function Qr(e, t, n, r) {
	let i = new Map(t.options.map((e, t) => [e.id, t])), a = /* @__PURE__ */ new Map();
	n.forEach((e) => {
		let n = e.answers[t.id];
		i.has(n) && a.set(n, (a.get(n) ?? 0) + 1);
	});
	let o = [...a.values()].reduce((e, t) => e + t, 0), s = [...a.entries()].map(([e, n]) => ({
		answerId: e,
		label: an(t, e),
		count: n,
		share: n / o
	})).sort((e, t) => t.count - e.count || (i.get(e.answerId) ?? 0) - (i.get(t.answerId) ?? 0)), c = s[0], l = !!r?.completedAt, u = l ? r?.answers[t.id] ?? null : null, d = u === null ? [] : n.map((e) => e.answers[t.id]).filter((e) => i.has(e)), f = d.flatMap((n) => {
		let r = Zr(e, t, u, n);
		return r === null ? [] : [r];
	}), p = d.filter((e) => e === u).length;
	return {
		surveyId: e.id,
		questionId: t.id,
		prompt: t.prompt,
		answerCount: o,
		consensusAnswerId: c?.answerId ?? null,
		consensusAnswerLabel: c?.label ?? null,
		consensusCount: c?.count ?? 0,
		consistency: o ? (c?.count ?? 0) / o : null,
		distribution: s,
		hasHumanBenchmark: l,
		humanAnswerId: u,
		humanAnswerLabel: u === null ? null : an(t, u),
		benchmarkSimilarity: f.length ? f.reduce((e, t) => e + t, 0) / f.length : null,
		exactBenchmarkMatchRate: d.length ? p / d.length : null
	};
}
function $r(e) {
	let t = e.filter((e) => e.value !== null && e.weight > 0), n = t.reduce((e, t) => e + t.weight, 0);
	return n ? t.reduce((e, t) => e + t.value * t.weight, 0) / n : null;
}
function ei(e) {
	let t = new Set(Object.values(e).flatMap((e) => e ?? []).flatMap((e) => e.personaAgent?.contextId ? [e.personaAgent.contextId] : []));
	return t.size === 1 ? [...t][0] : null;
}
function ti(e, t) {
	return e?.completedAt && t !== null && e.personaAgent?.contextId === t ? e : void 0;
}
function ni(e, t, n, r) {
	let i = e.questions.map((r) => Qr(e, r, t, n)), a = i.reduce((e, t) => e + t.answerCount, 0), o = i.reduce((e, t) => e + (t.benchmarkSimilarity === null ? 0 : t.answerCount), 0);
	return {
		surveyId: e.id,
		title: e.title,
		completedRuns: t.length,
		expectedRuns: r,
		questionCount: e.questions.length,
		answerCount: a,
		consistency: $r(i.map((e) => ({
			value: e.consistency,
			weight: e.answerCount
		}))),
		hasHumanBenchmark: !!n?.completedAt,
		benchmarkSimilarity: $r(i.map((e) => ({
			value: e.benchmarkSimilarity,
			weight: e.answerCount
		}))),
		exactBenchmarkMatchRate: $r(i.map((e) => ({
			value: e.exactBenchmarkMatchRate,
			weight: e.answerCount
		}))),
		benchmarkComparisons: o,
		questions: i
	};
}
function ri(e, t) {
	let n = Object.values(t.runsBySurvey).flatMap((e) => e ?? []).find((e) => !!e.experiment), r = new Set(n?.experiment?.surveyIds ?? Object.keys(t.runsBySurvey)), i = n?.experiment?.responsesPerSurvey ?? 1, a = ei(t.runsBySurvey), o = Zt.map((n) => ni(n, t.runsBySurvey[n.id] ?? [], ti(e[n.id]?.human, a), r.has(n.id) ? i : 0)), s = o.reduce((e, t) => e + t.answerCount, 0), c = o.reduce((e, t) => e + t.benchmarkComparisons, 0);
	return {
		experiment: t,
		overall: {
			completedRuns: t.completedRuns,
			expectedRuns: t.expectedRuns,
			surveysWithResults: o.filter((e) => e.completedRuns > 0).length,
			surveyCount: Zt.length,
			questionCount: o.reduce((e, t) => e + t.questionCount, 0),
			answerCount: s,
			consistency: $r(o.map((e) => ({
				value: e.consistency,
				weight: e.answerCount
			}))),
			humanBenchmarkCount: o.filter((e) => e.hasHumanBenchmark).length,
			benchmarkedSurveyCount: o.filter((e) => e.benchmarkComparisons > 0).length,
			benchmarkSimilarity: $r(o.map((e) => ({
				value: e.benchmarkSimilarity,
				weight: e.benchmarkComparisons
			}))),
			exactBenchmarkMatchRate: $r(o.map((e) => ({
				value: e.exactBenchmarkMatchRate,
				weight: e.benchmarkComparisons
			}))),
			benchmarkComparisons: c
		},
		surveys: o
	};
}
function ii(e, t) {
	let n = Yr(e).find((e) => e.id === t);
	return n ? ri(e, n) : null;
}
function ai(e, t) {
	let n = /* @__PURE__ */ new Map();
	return e.forEach((e) => {
		let r = t(e.aggregate);
		if (r === null) return;
		let i = n.get(e.dimensionCount) ?? [];
		i.push({
			value: r,
			status: e.status
		}), n.set(e.dimensionCount, i);
	}), [...n.entries()].sort(([e], [t]) => e - t).map(([e, t]) => ({
		dimensionCount: e,
		value: t.reduce((e, t) => e + t.value, 0) / t.length,
		experimentCount: t.length,
		completeExperimentCount: t.filter((e) => e.status === "complete").length,
		partialExperimentCount: t.filter((e) => e.status === "partial").length
	}));
}
function oi(e) {
	let t = Yr(e).flatMap((t) => t.dimensionCount === null ? [] : [{
		dimensionCount: t.dimensionCount,
		status: t.status,
		aggregate: ri(e, t)
	}]);
	return {
		overallBenchmarkMatch: ai(t, (e) => e.overall.benchmarkSimilarity),
		agentConsistency: ai(t, (e) => e.overall.consistency),
		surveyBenchmarkMatches: Object.fromEntries(Zt.map((e) => [e.id, ai(t, (t) => t.surveys.find((t) => t.surveyId === e.id)?.benchmarkSimilarity ?? null)]))
	};
}
//#endregion
//#region app/page.tsx
var si = {
	human: {
		label: "Human benchmark",
		shortLabel: "Human",
		Icon: M
	},
	agent: {
		label: "Agent run",
		shortLabel: "Agent",
		Icon: ne
	}
}, z = { name: "home" }, ci = new Intl.DateTimeFormat(void 0, {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit"
}), li = new Intl.DateTimeFormat(void 0, {
	hour: "2-digit",
	minute: "2-digit"
});
function ui(e) {
	return `${e}-${typeof crypto < "u" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}
function di(e) {
	if (!e) return "";
	let t = new Date(e);
	return Number.isNaN(t.getTime()) ? "Date unavailable" : ci.format(t);
}
function fi(e) {
	return e ? li.format(new Date(e)) : null;
}
function pi(e) {
	return {
		"--survey": e.color,
		"--pale": e.pale,
		"--ink": e.ink
	};
}
function mi(e) {
	return e ? `Digital ${e.displayName}` : "Persona not recorded";
}
function hi(e, t) {
	return !e || !t || e.contextId === t.contextId;
}
function gi(e, t) {
	return Date.parse(e.completedAt ?? e.startedAt) - Date.parse(t.completedAt ?? t.startedAt) || e.sequence - t.sequence;
}
function _i(e) {
	return e?.completedAt ? "complete" : e && Object.keys(e.answers).length > 0 ? "in-progress" : "not-started";
}
function vi(e, t) {
	if (!("surveyId" in t)) return t;
	let n = Ln(e, t.surveyId);
	if (t.name === "quiz") return (t.actor === "human" ? n.human : Bn(n, t.runId)) ? t : z;
	if (t.name === "result") return (t.actor === "human" ? n.human : Bn(n, t.runId))?.completedAt ? t : z;
	if (t.name === "comparison") {
		let e = Bn(n, t.runId);
		return n.human?.completedAt && e?.completedAt && e.benchmarkId === n.human.id && hi(n.human.personaAgent, e.personaAgent) ? t : z;
	}
	return n.human?.completedAt && Rn(n, n.human.id).length > 0 ? t : z;
}
function yi({ status: e, label: t }) {
	return e === "complete" ? /* @__PURE__ */ (0, R.jsxs)("span", {
		className: "status-pill status-complete",
		children: [
			/* @__PURE__ */ (0, R.jsx)(re, {
				size: 12,
				strokeWidth: 3
			}),
			" ",
			t ?? "Complete"
		]
	}) : e === "in-progress" ? /* @__PURE__ */ (0, R.jsx)("span", {
		className: "status-pill status-progress",
		children: t ?? "In progress"
	}) : /* @__PURE__ */ (0, R.jsx)("span", {
		className: "status-pill status-empty",
		children: t ?? "Not started"
	});
}
function bi() {
	return /* @__PURE__ */ (0, R.jsxs)("span", {
		className: "flex items-center gap-3",
		children: [/* @__PURE__ */ (0, R.jsxs)("span", {
			className: "logo-mark",
			"aria-hidden": "true",
			children: [/* @__PURE__ */ (0, R.jsx)("span", {}), /* @__PURE__ */ (0, R.jsx)("span", {})]
		}), /* @__PURE__ */ (0, R.jsxs)("span", { children: [/* @__PURE__ */ (0, R.jsx)("span", {
			className: "font-display block text-[18px] font-black leading-none tracking-[-0.03em]",
			children: "Mirror Match"
		}), /* @__PURE__ */ (0, R.jsx)("span", {
			className: "mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500",
			children: "Persona check"
		})] })]
	});
}
function xi({ children: e, onHome: t, simple: n = !1 }) {
	return /* @__PURE__ */ (0, R.jsxs)("main", {
		className: "min-h-screen",
		children: [/* @__PURE__ */ (0, R.jsxs)("header", {
			className: "site-header",
			children: [n ? /* @__PURE__ */ (0, R.jsx)("div", {
				className: "brand-button rounded-xl",
				children: /* @__PURE__ */ (0, R.jsx)(bi, {})
			}) : /* @__PURE__ */ (0, R.jsx)("button", {
				type: "button",
				onClick: t,
				"aria-label": "Go to Results",
				className: "brand-button rounded-xl focus-ring",
				children: /* @__PURE__ */ (0, R.jsx)(bi, {})
			}), !n && /* @__PURE__ */ (0, R.jsxs)("button", {
				type: "button",
				onClick: t,
				className: "header-home focus-ring",
				children: [/* @__PURE__ */ (0, R.jsx)(k, { size: 15 }), " Results"]
			})]
		}), e]
	});
}
function Si({ survey: e, history: t, onHuman: n, aggregate: r, interactionDisabled: i }) {
	let a = t.human, o = _i(a), s = !!r?.completedRuns;
	return /* @__PURE__ */ (0, R.jsxs)("article", {
		className: "survey-card",
		style: pi(e),
		children: [
			/* @__PURE__ */ (0, R.jsxs)("div", {
				className: "survey-card-header",
				children: [/* @__PURE__ */ (0, R.jsxs)("h2", {
					className: "survey-title font-display min-w-0 text-[clamp(1.55rem,3vw,2.15rem)] font-black leading-[0.98] tracking-[-0.045em] text-slate-950",
					children: [
						Zt.indexOf(e) + 1,
						". ",
						e.title
					]
				}), /* @__PURE__ */ (0, R.jsxs)("button", {
					type: "button",
					onClick: n,
					disabled: i,
					className: "run-row survey-human-run focus-ring",
					children: [
						/* @__PURE__ */ (0, R.jsx)("span", {
							className: "run-icon",
							children: /* @__PURE__ */ (0, R.jsx)(M, { size: 18 })
						}),
						/* @__PURE__ */ (0, R.jsx)("span", {
							className: "min-w-0 flex-1 text-left",
							children: /* @__PURE__ */ (0, R.jsx)("span", {
								className: "block text-sm font-bold text-slate-900",
								children: "Human benchmark"
							})
						}),
						/* @__PURE__ */ (0, R.jsx)(yi, { status: o }),
						/* @__PURE__ */ (0, R.jsx)(ie, {
							size: 17,
							className: "text-slate-400"
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, R.jsx)("p", {
				className: "survey-description mt-4 min-h-[3.1rem] text-sm leading-6 text-slate-600",
				children: e.description
			}),
			s && /* @__PURE__ */ (0, R.jsxs)("details", {
				className: "validation-question-details",
				children: [/* @__PURE__ */ (0, R.jsxs)("summary", { children: [/* @__PURE__ */ (0, R.jsxs)("span", {
					className: "validation-question-summary-label",
					children: [/* @__PURE__ */ (0, R.jsx)(O, {
						size: 15,
						className: "validation-question-chevron",
						"aria-hidden": "true"
					}), "Question results"]
				}), /* @__PURE__ */ (0, R.jsx)("span", {
					className: "validation-question-count",
					children: r?.questions.length
				})] }), /* @__PURE__ */ (0, R.jsx)("div", {
					className: "validation-question-list",
					children: r?.questions.map((e) => /* @__PURE__ */ (0, R.jsx)(Ci, { row: e }, e.questionId))
				})]
			})
		]
	});
}
function Ci({ row: e }) {
	return /* @__PURE__ */ (0, R.jsxs)("article", {
		className: "validation-question-result",
		children: [
			/* @__PURE__ */ (0, R.jsx)("h3", { children: e.prompt }),
			/* @__PURE__ */ (0, R.jsxs)("dl", { children: [
				/* @__PURE__ */ (0, R.jsxs)("div", { children: [/* @__PURE__ */ (0, R.jsx)("dt", { children: "Agent consensus" }), /* @__PURE__ */ (0, R.jsx)("dd", { children: e.consensusAnswerLabel ?? "No response" })] }),
				/* @__PURE__ */ (0, R.jsxs)("div", { children: [/* @__PURE__ */ (0, R.jsx)("dt", { children: "Consistency" }), /* @__PURE__ */ (0, R.jsx)("dd", { children: e.answerCount < 2 || e.consistency === null ? "Needs 2 responses" : fn(e.consistency) })] }),
				/* @__PURE__ */ (0, R.jsxs)("div", { children: [/* @__PURE__ */ (0, R.jsx)("dt", { children: "Human benchmark" }), /* @__PURE__ */ (0, R.jsx)("dd", { children: e.humanAnswerLabel ?? "Not completed" })] }),
				/* @__PURE__ */ (0, R.jsxs)("div", { children: [/* @__PURE__ */ (0, R.jsx)("dt", { children: "Exact benchmark match" }), /* @__PURE__ */ (0, R.jsx)("dd", { children: e.exactBenchmarkMatchRate === null ? "-" : fn(e.exactBenchmarkMatchRate) })] })
			] }),
			/* @__PURE__ */ (0, R.jsx)("div", {
				className: "validation-answer-distribution",
				children: e.distribution.map((t) => /* @__PURE__ */ (0, R.jsxs)("span", { children: [
					t.label,
					": ",
					t.count,
					"/",
					e.answerCount
				] }, t.answerId))
			})
		]
	});
}
var wi = [
	void 0,
	"8 5",
	"2 5",
	"11 4 2 4"
];
function Ti({ x: e, y: t, styleIndex: n, size: r = 4 }) {
	let i = {
		fill: n % 2 == 0 ? "var(--validation-trend-line)" : "var(--validation-trend-marker-fill)",
		stroke: "var(--validation-trend-line)",
		strokeWidth: 2
	};
	switch (n % 4) {
		case 1: return /* @__PURE__ */ (0, R.jsx)("rect", {
			x: e - r,
			y: t - r,
			width: r * 2,
			height: r * 2,
			rx: "1",
			...i
		});
		case 2: return /* @__PURE__ */ (0, R.jsx)("polygon", {
			points: `${e},${t - r - 1} ${e + r + 1},${t} ${e},${t + r + 1} ${e - r - 1},${t}`,
			...i
		});
		case 3: return /* @__PURE__ */ (0, R.jsx)("polygon", {
			points: `${e},${t - r - 1} ${e + r + 1},${t + r} ${e - r - 1},${t + r}`,
			...i
		});
		default: return /* @__PURE__ */ (0, R.jsx)("circle", {
			cx: e,
			cy: t,
			r,
			...i
		});
	}
}
function Ei(e) {
	let t = `${e.experimentCount} experiment${e.experimentCount === 1 ? "" : "s"}`;
	return e.partialExperimentCount ? `${t}, including ${e.partialExperimentCount} partial` : t;
}
function Di({ label: e, children: t }) {
	let n = (0, C.useId)(), [r, i] = (0, C.useState)(!1);
	return /* @__PURE__ */ (0, R.jsxs)("div", {
		className: "validation-trend-info",
		children: [/* @__PURE__ */ (0, R.jsx)("button", {
			type: "button",
			"aria-label": e,
			"aria-expanded": r,
			"aria-controls": n,
			onClick: () => i((e) => !e),
			children: /* @__PURE__ */ (0, R.jsx)(A, {
				size: 14,
				"aria-hidden": "true"
			})
		}), /* @__PURE__ */ (0, R.jsx)("p", {
			id: n,
			hidden: !r,
			children: t
		})]
	});
}
function Oi({ title: e, description: t, yAxisLabel: n, series: r, dimensionValues: i, emptyMessage: a }) {
	let o = (0, C.useId)(), s = r.flatMap((e) => e.points), c = i[0] ?? 0, l = i.at(-1) ?? 0, u = (e) => c === l ? 222 : 56 + (e - c) / (l - c) * 332, d = (e) => 14 + (1 - Math.max(0, Math.min(1, e))) * 184, f = i.length <= 6 ? i : Array.from(new Set(Array.from({ length: 6 }, (e, t) => Math.round(t * (i.length - 1) / 5)).map((e) => i[e])));
	return /* @__PURE__ */ (0, R.jsxs)("figure", {
		className: "validation-trend-chart",
		"aria-labelledby": `${o}-title ${o}-description`,
		children: [
			/* @__PURE__ */ (0, R.jsx)("h4", {
				id: `${o}-title`,
				className: "sr-only",
				children: e
			}),
			/* @__PURE__ */ (0, R.jsxs)("p", {
				id: `${o}-description`,
				className: "sr-only",
				children: [t, " The horizontal axis is the number of dimensions filled. The vertical axis runs from zero to one hundred percent. Exact plotted values and contributing experiment counts are listed in the accessible table."]
			}),
			r.length > 1 ? /* @__PURE__ */ (0, R.jsx)("ul", {
				className: "validation-trend-legend",
				"aria-label": "Chart series",
				children: r.map((e) => /* @__PURE__ */ (0, R.jsxs)("li", { children: [/* @__PURE__ */ (0, R.jsxs)("svg", {
					viewBox: "0 0 36 14",
					"aria-hidden": "true",
					focusable: "false",
					children: [/* @__PURE__ */ (0, R.jsx)("line", {
						x1: "2",
						x2: "34",
						y1: "7",
						y2: "7",
						stroke: "var(--validation-trend-line)",
						strokeWidth: "2.5",
						strokeDasharray: wi[e.styleIndex % 4],
						strokeLinecap: "round"
					}), /* @__PURE__ */ (0, R.jsx)(Ti, {
						x: 18,
						y: 7,
						styleIndex: e.styleIndex,
						size: 3
					})]
				}), /* @__PURE__ */ (0, R.jsx)("span", { children: e.label })] }, e.id))
			}) : null,
			s.length ? /* @__PURE__ */ (0, R.jsx)("section", {
				className: "validation-trend-scroll",
				"aria-label": `${e} plot`,
				children: /* @__PURE__ */ (0, R.jsxs)("svg", {
					viewBox: "0 0 400 250",
					className: "validation-trend-svg",
					"aria-hidden": "true",
					focusable: "false",
					children: [
						[
							0,
							.25,
							.5,
							.75,
							1
						].map((e) => /* @__PURE__ */ (0, R.jsxs)("g", { children: [/* @__PURE__ */ (0, R.jsx)("line", {
							x1: 56,
							x2: 388,
							y1: d(e),
							y2: d(e),
							className: "validation-trend-grid-line"
						}), /* @__PURE__ */ (0, R.jsxs)("text", {
							x: 47,
							y: d(e) + 4,
							textAnchor: "end",
							className: "validation-trend-tick",
							children: [Math.round(e * 100), "%"]
						})] }, e)),
						/* @__PURE__ */ (0, R.jsx)("line", {
							x1: 56,
							x2: 388,
							y1: 198,
							y2: 198,
							className: "validation-trend-axis-line"
						}),
						f.map((e) => /* @__PURE__ */ (0, R.jsxs)("g", { children: [/* @__PURE__ */ (0, R.jsx)("line", {
							x1: u(e),
							x2: u(e),
							y1: 198,
							y2: 203,
							className: "validation-trend-axis-line"
						}), /* @__PURE__ */ (0, R.jsx)("text", {
							x: u(e),
							y: 218,
							textAnchor: "middle",
							className: "validation-trend-tick",
							children: e
						})] }, e)),
						/* @__PURE__ */ (0, R.jsx)("text", {
							x: 444 / 2,
							y: 242,
							textAnchor: "middle",
							className: "validation-trend-axis-label",
							children: "Number of dimensions filled"
						}),
						/* @__PURE__ */ (0, R.jsx)("text", {
							transform: `translate(15 ${212 / 2}) rotate(-90)`,
							textAnchor: "middle",
							className: "validation-trend-axis-label",
							children: n
						}),
						r.map((e) => {
							let t = e.points.filter((e) => Number.isFinite(e.dimensionCount) && Number.isFinite(e.value)), n = t.map((e) => `${u(e.dimensionCount)},${d(e.value)}`).join(" ");
							return /* @__PURE__ */ (0, R.jsxs)("g", { children: [t.length > 1 ? /* @__PURE__ */ (0, R.jsx)("polyline", {
								points: n,
								fill: "none",
								stroke: "var(--validation-trend-line)",
								strokeWidth: "2.5",
								strokeDasharray: wi[e.styleIndex % 4],
								strokeLinecap: "round",
								strokeLinejoin: "round"
							}) : null, t.map((t) => /* @__PURE__ */ (0, R.jsxs)("g", {
								className: "validation-trend-point",
								children: [/* @__PURE__ */ (0, R.jsxs)("title", { children: [
									e.label,
									", ",
									t.dimensionCount,
									" dimensions,",
									" ",
									Math.round(t.value * 100),
									" percent,",
									" ",
									Ei(t)
								] }), /* @__PURE__ */ (0, R.jsx)(Ti, {
									x: u(t.dimensionCount),
									y: d(t.value),
									styleIndex: e.styleIndex
								})]
							}, `${e.id}:${t.dimensionCount}`))] }, e.id);
						})
					]
				})
			}) : /* @__PURE__ */ (0, R.jsx)("output", {
				className: "validation-trend-empty",
				children: a
			}),
			s.length ? /* @__PURE__ */ (0, R.jsxs)("table", {
				className: "sr-only",
				children: [
					/* @__PURE__ */ (0, R.jsxs)("caption", { children: ["Exact values plotted in ", e] }),
					/* @__PURE__ */ (0, R.jsx)("thead", { children: /* @__PURE__ */ (0, R.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, R.jsx)("th", { children: "Series" }),
						/* @__PURE__ */ (0, R.jsx)("th", { children: "Dimensions filled" }),
						/* @__PURE__ */ (0, R.jsx)("th", { children: "Average" }),
						/* @__PURE__ */ (0, R.jsx)("th", { children: "Experiments averaged" }),
						/* @__PURE__ */ (0, R.jsx)("th", { children: "Complete experiments" }),
						/* @__PURE__ */ (0, R.jsx)("th", { children: "Partial experiments" })
					] }) }),
					/* @__PURE__ */ (0, R.jsx)("tbody", { children: r.flatMap((e) => e.points.map((t) => /* @__PURE__ */ (0, R.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, R.jsx)("th", {
							scope: "row",
							children: e.label
						}),
						/* @__PURE__ */ (0, R.jsx)("td", { children: t.dimensionCount }),
						/* @__PURE__ */ (0, R.jsx)("td", { children: fn(t.value) }),
						/* @__PURE__ */ (0, R.jsx)("td", { children: t.experimentCount }),
						/* @__PURE__ */ (0, R.jsx)("td", { children: t.completeExperimentCount }),
						/* @__PURE__ */ (0, R.jsx)("td", { children: t.partialExperimentCount })
					] }, `${e.id}:${t.dimensionCount}`))) })
				]
			}) : null
		]
	});
}
function ki({ data: e }) {
	let [t, n] = (0, C.useState)("overall"), r = Array.from(new Set([
		...e.overallBenchmarkMatch,
		...e.agentConsistency,
		...Object.values(e.surveyBenchmarkMatches).flat()
	].map((e) => e.dimensionCount))).sort((e, t) => e - t), i = t === "overall" ? [{
		id: "overall-benchmark-match",
		label: "Overall benchmark match",
		points: e.overallBenchmarkMatch,
		styleIndex: 0
	}] : Zt.map((t, n) => ({
		id: t.id,
		label: t.title,
		points: e.surveyBenchmarkMatches[t.id],
		styleIndex: n
	})), a = [{
		id: "agent-consistency",
		label: "Overall Agent consistency",
		points: e.agentConsistency,
		styleIndex: 0
	}];
	return /* @__PURE__ */ (0, R.jsxs)("section", {
		className: "validation-trends",
		"aria-labelledby": "validation-trends-title",
		children: [/* @__PURE__ */ (0, R.jsx)("header", {
			className: "validation-trends-header",
			children: /* @__PURE__ */ (0, R.jsxs)("div", { children: [/* @__PURE__ */ (0, R.jsx)("span", {
				className: "section-kicker",
				children: "Validation history"
			}), /* @__PURE__ */ (0, R.jsxs)("div", {
				className: "validation-trend-title-row",
				children: [/* @__PURE__ */ (0, R.jsx)("h2", {
					id: "validation-trends-title",
					children: "Performance by persona dimensions"
				}), /* @__PURE__ */ (0, R.jsx)(Di, {
					label: "About validation history calculations",
					children: "Each point averages experiments with the same number of filled dimensions. Benchmark lines use the currently saved Human benchmarks."
				})]
			})] })
		}), /* @__PURE__ */ (0, R.jsxs)("div", {
			className: "validation-trends-grid",
			children: [/* @__PURE__ */ (0, R.jsxs)("article", {
				className: "validation-trend-card",
				children: [/* @__PURE__ */ (0, R.jsxs)("header", {
					className: "validation-trend-card-header",
					children: [/* @__PURE__ */ (0, R.jsxs)("div", {
						className: "validation-trend-title-row",
						children: [/* @__PURE__ */ (0, R.jsx)("h3", { children: "Benchmark match" }), /* @__PURE__ */ (0, R.jsx)(Di, {
							label: "About benchmark match",
							children: "Average Agent match against the available Human benchmark."
						})]
					}), /* @__PURE__ */ (0, R.jsxs)("label", {
						htmlFor: "validation-benchmark-trend-mode",
						children: [/* @__PURE__ */ (0, R.jsx)("span", { children: "View" }), /* @__PURE__ */ (0, R.jsxs)("select", {
							id: "validation-benchmark-trend-mode",
							"aria-label": "Benchmark match view",
							value: t,
							onChange: (e) => n(e.target.value),
							children: [/* @__PURE__ */ (0, R.jsx)("option", {
								value: "overall",
								children: "Overall benchmark match"
							}), /* @__PURE__ */ (0, R.jsx)("option", {
								value: "individual",
								children: "Individual benchmark match"
							})]
						})]
					})]
				}), /* @__PURE__ */ (0, R.jsx)(Oi, {
					title: t === "overall" ? "Overall benchmark match by persona dimensions" : "Individual benchmark match by persona dimensions",
					description: t === "overall" ? "One line shows the average overall benchmark match at each saved dimension count." : "Four lines show average benchmark match for the four Validation surveys at each saved dimension count.",
					yAxisLabel: "Benchmark match",
					series: i,
					dimensionValues: r,
					emptyMessage: "Complete Human benchmarks and run Agent validation at a known dimension count to chart benchmark match."
				})]
			}), /* @__PURE__ */ (0, R.jsxs)("article", {
				className: "validation-trend-card",
				children: [/* @__PURE__ */ (0, R.jsx)("header", {
					className: "validation-trend-card-header",
					children: /* @__PURE__ */ (0, R.jsxs)("div", {
						className: "validation-trend-title-row",
						children: [/* @__PURE__ */ (0, R.jsx)("h3", { children: "Agent consistency" }), /* @__PURE__ */ (0, R.jsx)(Di, {
							label: "About Agent consistency",
							children: "Average agreement on the most common answer at each dimension count."
						})]
					})
				}), /* @__PURE__ */ (0, R.jsx)(Oi, {
					title: "Overall Agent consistency by persona dimensions",
					description: "One line shows average overall Agent consistency at each saved dimension count.",
					yAxisLabel: "Agent consistency",
					series: a,
					dimensionValues: r,
					emptyMessage: "Run Agent validation at a known dimension count to chart Agent consistency."
				})]
			})]
		})]
	});
}
function Ai({ store: e, onHuman: t, onRunAll: n, onLicense: r, runningExperiment: i, runDisabled: a, selectedExperimentId: o, onSelectExperiment: s }) {
	let c = Yr(e), l = c.some((e) => e.id === o) ? o : c[0]?.id ?? null, u = l ? ii(e, l) : null, d = zr(u?.experiment ?? null), f = oi(e);
	return /* @__PURE__ */ (0, R.jsxs)(xi, {
		simple: !0,
		children: [/* @__PURE__ */ (0, R.jsxs)("section", {
			className: "hero-wrap",
			children: [
				/* @__PURE__ */ (0, R.jsx)("div", {
					className: "hero-orbit orbit-one",
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ (0, R.jsx)("div", {
					className: "hero-orbit orbit-two",
					"aria-hidden": "true"
				}),
				/* @__PURE__ */ (0, R.jsxs)("div", {
					className: "hero-grid",
					children: [/* @__PURE__ */ (0, R.jsxs)("div", {
						className: "relative z-10 max-w-[790px]",
						children: [/* @__PURE__ */ (0, R.jsxs)("h1", {
							className: "font-display text-[clamp(3.25rem,8vw,7.1rem)] font-black leading-[0.84] tracking-[-0.07em] text-slate-950",
							children: ["Validation ", /* @__PURE__ */ (0, R.jsx)("span", {
								className: "ink-swipe",
								children: "results"
							})]
						}), /* @__PURE__ */ (0, R.jsx)("p", {
							className: "mt-7 max-w-[650px] text-[clamp(1rem,2vw,1.25rem)] leading-8 text-slate-600",
							children: "Fill in the 4 surveys, then compare your results with your digital twin's"
						})]
					}), /* @__PURE__ */ (0, R.jsxs)("div", {
						className: "validation-batch-action",
						children: [/* @__PURE__ */ (0, R.jsxs)("button", {
							type: "button",
							onClick: n,
							disabled: a,
							"aria-busy": i,
							className: "primary-button focus-ring",
							children: [i ? /* @__PURE__ */ (0, R.jsx)(se, {
								size: 18,
								className: "animate-spin"
							}) : /* @__PURE__ */ (0, R.jsx)(ne, { size: 18 }), i ? "Running 40 Agent responses..." : "Run Agent validation"]
						}), /* @__PURE__ */ (0, R.jsx)("p", { children: "Starts 10 fresh runs per survey" })]
					})]
				})
			]
		}), /* @__PURE__ */ (0, R.jsxs)("section", {
			className: "mx-auto max-w-[1240px] px-5 pb-20 pt-16 sm:px-8 lg:px-10",
			children: [
				/* @__PURE__ */ (0, R.jsx)(ki, { data: f }),
				/* @__PURE__ */ (0, R.jsxs)("div", {
					className: "validation-results-toolbar",
					children: [
						/* @__PURE__ */ (0, R.jsx)("label", {
							htmlFor: "validation-experiment-selector",
							children: "Experiment"
						}),
						c.length ? /* @__PURE__ */ (0, R.jsx)("select", {
							id: "validation-experiment-selector",
							value: l ?? "",
							onChange: (e) => s(e.target.value),
							children: c.map((e) => /* @__PURE__ */ (0, R.jsx)("option", {
								value: e.id,
								children: e.label
							}, e.id))
						}) : /* @__PURE__ */ (0, R.jsx)("span", { children: "No Agent experiments yet" }),
						d ? /* @__PURE__ */ (0, R.jsx)("output", {
							className: "validation-experiment-warning",
							children: d
						}) : null
					]
				}),
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "validation-overall-results",
					"aria-live": "polite",
					children: [/* @__PURE__ */ (0, R.jsxs)("div", { children: [
						/* @__PURE__ */ (0, R.jsx)("span", { children: "Overall benchmark match" }),
						/* @__PURE__ */ (0, R.jsx)("strong", { children: u?.overall.benchmarkSimilarity === null || !u ? "No benchmarks" : fn(u.overall.benchmarkSimilarity) }),
						/* @__PURE__ */ (0, R.jsx)("small", { children: u ? `${u.overall.benchmarkedSurveyCount} of 4 surveys compared` : "Complete Human benchmarks to compare" })
					] }), /* @__PURE__ */ (0, R.jsxs)("div", { children: [
						/* @__PURE__ */ (0, R.jsx)("span", { children: "Overall Agent consistency" }),
						/* @__PURE__ */ (0, R.jsx)("strong", { children: u ? u.experiment.expectedRuns === 1 ? "1 response" : u.overall.consistency === null ? "-" : fn(u.overall.consistency) : "-" }),
						/* @__PURE__ */ (0, R.jsx)("small", { children: "Agreement with the most common answer per question" })
					] })]
				}),
				/* @__PURE__ */ (0, R.jsx)("p", {
					className: "validation-results-method",
					children: "Overall match pools every Agent answer against the available Human answer for the same question. Consistency measures how often Agents selected that question's most common answer. These are separate signals."
				}),
				/* @__PURE__ */ (0, R.jsx)("div", {
					className: "validation-survey-list flex flex-col gap-6",
					children: Zt.map((n) => /* @__PURE__ */ (0, R.jsx)(Si, {
						survey: n,
						history: Ln(e, n.id),
						onHuman: () => t(n.id),
						aggregate: u?.surveys.find((e) => e.surveyId === n.id),
						interactionDisabled: i
					}, n.id))
				}),
				/* @__PURE__ */ (0, R.jsx)("div", {
					className: "mt-8 flex justify-end",
					children: /* @__PURE__ */ (0, R.jsx)("button", {
						type: "button",
						onClick: r,
						className: "quiet-button text-sm font-bold text-slate-600 hover:text-slate-950 focus-ring",
						children: "Sources and license"
					})
				})
			]
		})]
	});
}
function ji({ survey: e, actor: t, run: n, agentRun: r, onSaveAnswer: i, onComplete: a, onHome: o }) {
	let s = e.questions.findIndex((e) => !n.answers[e.id]), [c, l] = (0, C.useState)(s === -1 ? e.questions.length - 1 : s), [u, d] = (0, C.useState)(!1), f = e.questions[c], p = n.answers[f.id], m = (c + 1) / e.questions.length * 100, h = si[t], g = c === e.questions.length - 1, _ = (0, C.useRef)(null), v = (0, C.useRef)(!1), y = (0, C.useRef)(void 0);
	(0, C.useEffect)(() => (v.current = !1, _.current?.focus({ preventScroll: !0 }), () => {
		y.current !== void 0 && (window.clearTimeout(y.current), y.current = void 0);
	}), [c]);
	function b(t) {
		if (!v.current) {
			if (p === t) {
				i(f.id, null);
				return;
			}
			i(f.id, t), !(g || v.current) && (v.current = !0, d(!0), y.current = window.setTimeout(() => {
				y.current = void 0, v.current = !1, d(!1), l((t) => Math.min(t + 1, e.questions.length - 1));
			}, 300));
		}
	}
	function x() {
		!p || v.current || (g ? a() : l((e) => e + 1));
	}
	return /* @__PURE__ */ (0, R.jsx)(xi, {
		onHome: o,
		children: /* @__PURE__ */ (0, R.jsxs)("div", {
			className: "quiz-stage",
			style: pi(e),
			children: [
				/* @__PURE__ */ (0, R.jsx)("div", {
					className: "quiz-topline",
					children: /* @__PURE__ */ (0, R.jsxs)("div", { children: [/* @__PURE__ */ (0, R.jsx)("p", {
						className: "section-kicker",
						style: { color: e.ink },
						children: e.shortTitle
					}), /* @__PURE__ */ (0, R.jsxs)("div", {
						className: "validation-quiz-context",
						children: [
							/* @__PURE__ */ (0, R.jsx)(h.Icon, { size: 17 }),
							t === "agent" && r ? `Agent run ${r.sequence}` : "Human benchmark",
							t === "agent" && r && /* @__PURE__ */ (0, R.jsxs)("span", {
								className: "run-metadata-chip",
								children: [r.dimensionCount, " persona dimensions"]
							}),
							/* @__PURE__ */ (0, R.jsxs)("span", {
								className: "run-metadata-chip",
								children: ["Persona agent: ", mi(n.personaAgent)]
							})
						]
					})] })
				}),
				/* @__PURE__ */ (0, R.jsx)("div", {
					className: "question-progress-copy",
					children: /* @__PURE__ */ (0, R.jsxs)("strong", { children: [
						"Question ",
						c + 1,
						" of ",
						e.questions.length
					] })
				}),
				/* @__PURE__ */ (0, R.jsx)("div", {
					className: "question-progress-track",
					role: "progressbar",
					"aria-label": "Question progress in this survey",
					"aria-valuemin": 1,
					"aria-valuemax": e.questions.length,
					"aria-valuenow": c + 1,
					children: /* @__PURE__ */ (0, R.jsx)("div", {
						className: "question-progress-bar",
						style: { width: `${m}%` }
					})
				}),
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "question-card",
					"data-question-id": f.id,
					children: [/* @__PURE__ */ (0, R.jsx)("div", {
						className: "question-heading",
						children: /* @__PURE__ */ (0, R.jsxs)("div", { children: [f.dimension && /* @__PURE__ */ (0, R.jsx)("p", {
							className: "validation-question-dimension",
							style: { color: e.ink },
							children: f.dimension
						}), /* @__PURE__ */ (0, R.jsx)("h1", {
							ref: _,
							tabIndex: -1,
							className: "validation-question-title outline-none",
							children: f.prompt
						})] })
					}), /* @__PURE__ */ (0, R.jsxs)("fieldset", {
						className: `validation-answer-list ${e.kind === "scale" ? "scale-options" : ""}`,
						children: [/* @__PURE__ */ (0, R.jsx)("legend", {
							className: "sr-only",
							children: f.prompt
						}), f.options.map((t) => {
							let n = p === t.id;
							return /* @__PURE__ */ (0, R.jsxs)("button", {
								type: "button",
								"aria-pressed": n,
								onClick: () => b(t.id),
								className: `answer-option focus-ring ${n ? "answer-selected" : ""} ${e.kind === "scale" ? "scale-option" : ""}`,
								style: n ? pi(e) : void 0,
								children: [e.kind === "scale" ? /* @__PURE__ */ (0, R.jsx)("span", {
									className: "option-key",
									children: t.id
								}) : /* @__PURE__ */ (0, R.jsx)("span", {
									className: "option-radio",
									"aria-hidden": "true"
								}), /* @__PURE__ */ (0, R.jsx)("span", {
									className: "flex-1 text-left",
									children: t.label
								})]
							}, t.id);
						})]
					})]
				}),
				/* @__PURE__ */ (0, R.jsxs)("div", {
					className: "quiz-footer-actions",
					children: [/* @__PURE__ */ (0, R.jsx)("div", {
						className: "quiz-footer-secondary-actions",
						children: /* @__PURE__ */ (0, R.jsxs)("button", {
							type: "button",
							onClick: () => l((e) => Math.max(0, e - 1)),
							disabled: c === 0 || u,
							className: "secondary-button focus-ring",
							children: [/* @__PURE__ */ (0, R.jsx)(D, { size: 17 }), " Previous"]
						})
					}), /* @__PURE__ */ (0, R.jsxs)("button", {
						type: "button",
						onClick: x,
						disabled: !p || u,
						className: "primary-button focus-ring",
						style: {
							backgroundColor: e.color,
							color: "var(--validation-on-accent)"
						},
						children: [
							g ? "Finish this run" : "Next",
							" ",
							/* @__PURE__ */ (0, R.jsx)(te, { size: 17 })
						]
					})]
				})
			]
		})
	});
}
function Mi({ result: e, survey: t }) {
	return /* @__PURE__ */ (0, R.jsx)("div", {
		className: "mt-8 space-y-4",
		children: Object.entries(e.scores).map(([e, n]) => /* @__PURE__ */ (0, R.jsxs)("div", { children: [/* @__PURE__ */ (0, R.jsxs)("div", {
			className: "mb-1.5 flex items-center justify-between gap-3 text-xs font-bold text-slate-600",
			children: [/* @__PURE__ */ (0, R.jsx)("span", { children: $t[e].name.replace("The ", "") }), /* @__PURE__ */ (0, R.jsxs)("span", { children: [n, " / 5"] })]
		}), /* @__PURE__ */ (0, R.jsx)("div", {
			className: "h-2.5 overflow-hidden rounded-full bg-slate-100",
			children: /* @__PURE__ */ (0, R.jsx)("div", {
				className: "h-full rounded-full",
				style: {
					width: `${n / 5 * 100}%`,
					backgroundColor: t.color
				}
			})
		})] }, e))
	});
}
function B({ result: e, survey: t, compact: n = !1 }) {
	return /* @__PURE__ */ (0, R.jsx)("div", {
		className: `mt-7 ${n ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}`,
		children: e.values.map((e) => /* @__PURE__ */ (0, R.jsxs)("div", {
			className: "dial-card",
			children: [
				/* @__PURE__ */ (0, R.jsxs)("div", {
					className: "flex items-center justify-between gap-3",
					children: [/* @__PURE__ */ (0, R.jsx)("p", {
						className: "text-xs font-black uppercase tracking-[0.11em] text-slate-500",
						children: e.dimension
					}), /* @__PURE__ */ (0, R.jsxs)("span", {
						className: "rounded-full px-2.5 py-1 text-xs font-black",
						style: {
							backgroundColor: t.pale,
							color: t.ink
						},
						children: [e.value, " / 5"]
					})]
				}),
				/* @__PURE__ */ (0, R.jsx)("div", {
					className: "mt-4 flex gap-1.5",
					"aria-label": `${e.value} out of 5`,
					children: [
						1,
						2,
						3,
						4,
						5
					].map((n) => /* @__PURE__ */ (0, R.jsx)("span", {
						className: "h-2 flex-1 rounded-full",
						style: { backgroundColor: n <= e.value ? t.color : "#e8eaf0" }
					}, n))
				}),
				/* @__PURE__ */ (0, R.jsx)("p", {
					className: "mt-3 text-sm font-bold text-slate-800",
					children: e.label
				})
			]
		}, e.id))
	});
}
function V({ result: e, survey: t, compact: n = !1 }) {
	return /* @__PURE__ */ (0, R.jsx)("div", {
		className: "mt-7 space-y-5",
		children: tn.map((r, i) => /* @__PURE__ */ (0, R.jsxs)("div", { children: [
			/* @__PURE__ */ (0, R.jsxs)("div", {
				className: "mb-2 flex items-center justify-between gap-4 text-xs font-bold text-slate-600",
				children: [/* @__PURE__ */ (0, R.jsx)("span", { children: r.low }), /* @__PURE__ */ (0, R.jsx)("span", { children: r.high })]
			}),
			/* @__PURE__ */ (0, R.jsxs)("div", {
				className: "relative h-3 rounded-full bg-slate-100",
				children: [/* @__PURE__ */ (0, R.jsx)("span", { className: "absolute left-1/2 top-[-3px] h-[18px] w-px bg-slate-300" }), /* @__PURE__ */ (0, R.jsx)("span", {
					className: "absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full shadow",
					style: {
						left: `${e.scores[i]}%`,
						backgroundColor: t.color
					}
				})]
			}),
			!n && /* @__PURE__ */ (0, R.jsxs)("p", {
				className: "mt-2 text-center text-xs font-bold",
				style: { color: t.ink },
				children: [
					e.scores[i],
					"% toward ",
					r.high
				]
			})
		] }, r.key))
	});
}
function Ni({ result: e, survey: t, compact: n = !1 }) {
	return e.kind === "categorical" ? /* @__PURE__ */ (0, R.jsx)(Mi, {
		result: e,
		survey: t
	}) : e.kind === "scale" ? /* @__PURE__ */ (0, R.jsx)(B, {
		result: e,
		survey: t,
		compact: n
	}) : /* @__PURE__ */ (0, R.jsx)(V, {
		result: e,
		survey: t,
		compact: n
	});
}
function Pi({ survey: e, actor: t, run: n, agentRun: r, hasCompletedHuman: i, onHistory: a, onHumanChange: o, onHome: s }) {
	let c = ln(e, n.answers), l = t === "agent" && r, u = si[t];
	return /* @__PURE__ */ (0, R.jsx)(xi, {
		onHome: s,
		children: /* @__PURE__ */ (0, R.jsxs)("div", {
			className: "result-stage",
			style: pi(e),
			children: [
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "result-hero",
					children: [
						/* @__PURE__ */ (0, R.jsx)("div", {
							className: "result-spark spark-a",
							"aria-hidden": "true",
							children: "✦"
						}),
						/* @__PURE__ */ (0, R.jsx)("div", {
							className: "result-spark spark-b",
							"aria-hidden": "true",
							children: "●"
						}),
						/* @__PURE__ */ (0, R.jsxs)("div", {
							className: "relative z-10",
							children: [
								/* @__PURE__ */ (0, R.jsxs)("div", {
									className: "mx-auto flex w-fit items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-xs font-black uppercase tracking-[0.13em] text-slate-600 shadow-sm",
									children: [
										/* @__PURE__ */ (0, R.jsx)(u.Icon, { size: 15 }),
										" ",
										l ? `Agent run ${r.sequence}` : "Human benchmark",
										" -",
										" ",
										e.shortTitle
									]
								}),
								/* @__PURE__ */ (0, R.jsxs)("div", {
									className: "mx-auto mt-4 w-fit rounded-full bg-white/70 px-3 py-1.5 text-xs font-black text-slate-600 shadow-sm",
									children: ["Persona agent: ", mi(n.personaAgent)]
								}),
								l && /* @__PURE__ */ (0, R.jsxs)("div", {
									className: "mx-auto mt-2 w-fit rounded-full px-3 py-1.5 text-xs font-black",
									style: {
										backgroundColor: e.color,
										color: "var(--validation-on-accent)"
									},
									children: [r.dimensionCount ?? "Not recorded", " persona dimensions"]
								}),
								/* @__PURE__ */ (0, R.jsx)("h1", {
									className: "font-display mx-auto mt-3 max-w-[850px] text-center text-[28px] font-black leading-[0.9] tracking-[-0.065em] text-slate-950",
									children: c.title
								}),
								"description" in c && /* @__PURE__ */ (0, R.jsx)("p", {
									className: "mx-auto mt-6 max-w-[620px] text-center text-[14px] leading-7 text-slate-600",
									children: c.description
								})
							]
						})
					]
				}),
				/* @__PURE__ */ (0, R.jsxs)("section", {
					"aria-labelledby": "result-detail-heading",
					className: "mx-auto mt-7 max-w-[900px] rounded-[30px] bg-white p-6 shadow-sm sm:p-9",
					children: [/* @__PURE__ */ (0, R.jsx)("h2", {
						id: "result-detail-heading",
						className: "section-kicker",
						children: "Result detail"
					}), /* @__PURE__ */ (0, R.jsx)(Ni, {
						result: c,
						survey: e
					})]
				}),
				/* @__PURE__ */ (0, R.jsxs)("div", {
					className: "mx-auto mt-7 flex max-w-[900px] flex-wrap items-center justify-center gap-3 pb-14",
					children: [
						!l && /* @__PURE__ */ (0, R.jsxs)("button", {
							type: "button",
							onClick: o,
							className: "secondary-button focus-ring",
							children: [/* @__PURE__ */ (0, R.jsx)(le, { size: 16 }), " Retake benchmark"]
						}),
						/* @__PURE__ */ (0, R.jsxs)("button", {
							type: "button",
							onClick: s,
							className: "secondary-button focus-ring",
							children: [/* @__PURE__ */ (0, R.jsx)(k, { size: 16 }), " Results"]
						}),
						l && i && /* @__PURE__ */ (0, R.jsxs)("button", {
							type: "button",
							onClick: a,
							className: "secondary-button focus-ring",
							children: [/* @__PURE__ */ (0, R.jsx)(ce, { size: 16 }), " Earlier run history"]
						})
					]
				})
			]
		})
	});
}
function Fi({ survey: e, actor: t, result: n }) {
	let r = si[t];
	return /* @__PURE__ */ (0, R.jsxs)("div", {
		className: "comparison-result-card",
		children: [
			/* @__PURE__ */ (0, R.jsxs)("div", {
				className: "flex items-center gap-3",
				children: [/* @__PURE__ */ (0, R.jsx)("span", {
					className: "run-icon",
					style: {
						backgroundColor: e.pale,
						color: e.ink
					},
					children: /* @__PURE__ */ (0, R.jsx)(r.Icon, { size: 18 })
				}), /* @__PURE__ */ (0, R.jsxs)("div", { children: [/* @__PURE__ */ (0, R.jsx)("p", {
					className: "text-xs font-black uppercase tracking-[0.12em] text-slate-500",
					children: r.shortLabel
				}), /* @__PURE__ */ (0, R.jsx)("h3", {
					className: "font-display text-xl font-black tracking-[-0.03em] text-slate-950",
					children: n.title
				})] })]
			}),
			"description" in n && /* @__PURE__ */ (0, R.jsx)("p", {
				className: "mt-4 text-sm leading-6 text-slate-600",
				children: n.description
			}),
			/* @__PURE__ */ (0, R.jsx)(Ni, {
				result: n,
				survey: e,
				compact: !0
			})
		]
	});
}
function Ii({ survey: e, human: t, agentRun: n, onResult: r, onHistory: i, onHome: a }) {
	let o = dn(e, t.answers, n.answers), s = ln(e, t.answers), c = ln(e, n.answers), l = o.exactMatches === e.questions.length ? "Every answer matched." : `${o.exactMatches} of ${e.questions.length} answers matched exactly.`;
	return /* @__PURE__ */ (0, R.jsx)(xi, {
		onHome: a,
		children: /* @__PURE__ */ (0, R.jsxs)("div", {
			className: "comparison-stage",
			style: pi(e),
			children: [
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "comparison-hero",
					children: [
						/* @__PURE__ */ (0, R.jsxs)("div", {
							className: "comparison-label",
							children: [
								/* @__PURE__ */ (0, R.jsx)(oe, { size: 15 }),
								" ",
								e.shortTitle,
								" - Agent run",
								" ",
								n.sequence
							]
						}),
						/* @__PURE__ */ (0, R.jsx)("div", {
							className: "similarity-ring",
							style: {
								"--score": `${Math.round(o.similarity * 100) * 3.6}deg`,
								"--survey": e.color
							},
							children: /* @__PURE__ */ (0, R.jsxs)("div", { children: [/* @__PURE__ */ (0, R.jsx)("span", { children: fn(o.similarity) }), /* @__PURE__ */ (0, R.jsx)("small", { children: "similarity" })] })
						}),
						/* @__PURE__ */ (0, R.jsx)("h1", {
							className: "font-display mt-6 text-center text-[clamp(2.5rem,6vw,5.6rem)] font-black leading-[0.92] tracking-[-0.06em] text-slate-950",
							children: "Human meets Agent"
						}),
						/* @__PURE__ */ (0, R.jsxs)("p", {
							className: "mx-auto mt-5 max-w-[680px] text-center text-base leading-7 text-slate-600",
							children: [
								l,
								" ",
								e.kind === "scale" ? "The headline score gives partial credit when ratings are close." : "The headline score uses exact question matches."
							]
						}),
						/* @__PURE__ */ (0, R.jsxs)("div", {
							className: "mt-7 flex flex-wrap justify-center gap-3",
							children: [
								/* @__PURE__ */ (0, R.jsxs)("span", {
									className: "metric-chip",
									children: [
										"Persona agent:",
										" ",
										/* @__PURE__ */ (0, R.jsx)("strong", { children: mi(n.personaAgent) })
									]
								}),
								/* @__PURE__ */ (0, R.jsxs)("span", {
									className: "metric-chip",
									children: [/* @__PURE__ */ (0, R.jsx)("strong", { children: n.dimensionCount ?? "N/A" }), " persona dimensions"]
								}),
								/* @__PURE__ */ (0, R.jsxs)("span", {
									className: "metric-chip",
									children: [/* @__PURE__ */ (0, R.jsx)("strong", { children: o.exactMatches }), " exact matches"]
								}),
								/* @__PURE__ */ (0, R.jsxs)("span", {
									className: "metric-chip",
									children: [/* @__PURE__ */ (0, R.jsx)("strong", { children: o.differences.length }), " differences"]
								}),
								o.withinOne !== void 0 && /* @__PURE__ */ (0, R.jsxs)("span", {
									className: "metric-chip",
									children: [/* @__PURE__ */ (0, R.jsx)("strong", { children: o.withinOne }), " within one point"]
								}),
								o.profileSimilarity !== void 0 && /* @__PURE__ */ (0, R.jsxs)("span", {
									className: "metric-chip",
									children: [/* @__PURE__ */ (0, R.jsx)("strong", { children: fn(o.profileSimilarity) }), " profile similarity"]
								})
							]
						}),
						/* @__PURE__ */ (0, R.jsxs)("p", {
							className: "mt-4 text-xs font-bold text-slate-500",
							children: [
								"Completed ",
								di(n.completedAt),
								n.migrated ? " - imported from the earlier app version" : ""
							]
						})
					]
				}),
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "mx-auto mt-10 grid max-w-[1080px] gap-5 lg:grid-cols-2",
					children: [/* @__PURE__ */ (0, R.jsx)(Fi, {
						survey: e,
						actor: "human",
						result: s
					}), /* @__PURE__ */ (0, R.jsx)(Fi, {
						survey: e,
						actor: "agent",
						result: c
					})]
				}),
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "mx-auto mt-8 max-w-[1080px] rounded-[30px] bg-white p-6 shadow-sm sm:p-9",
					children: [/* @__PURE__ */ (0, R.jsxs)("div", {
						className: "flex flex-col justify-between gap-4 pb-6 sm:flex-row sm:items-end",
						children: [/* @__PURE__ */ (0, R.jsxs)("div", { children: [/* @__PURE__ */ (0, R.jsx)("p", {
							className: "section-kicker",
							children: "Question-level audit"
						}), /* @__PURE__ */ (0, R.jsx)("h2", {
							className: "font-display mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950",
							children: "Where the answers differed"
						})] }), /* @__PURE__ */ (0, R.jsxs)("p", {
							className: "text-sm text-slate-500",
							children: [
								o.differences.length,
								" ",
								o.differences.length === 1 ? "question" : "questions"
							]
						})]
					}), o.differences.length === 0 ? /* @__PURE__ */ (0, R.jsxs)("div", {
						className: "empty-match",
						children: [
							/* @__PURE__ */ (0, R.jsx)(ae, {
								size: 34,
								style: { color: e.color }
							}),
							/* @__PURE__ */ (0, R.jsx)("h3", {
								className: "font-display mt-4 text-2xl font-black text-slate-950",
								children: "A perfect match"
							}),
							/* @__PURE__ */ (0, R.jsx)("p", {
								className: "mt-2 text-sm leading-6 text-slate-600",
								children: "The Human benchmark and Agent run selected the same answer for every question."
							})
						]
					}) : /* @__PURE__ */ (0, R.jsx)("div", { children: o.differences.map((e, t) => /* @__PURE__ */ (0, R.jsxs)("article", {
						className: "difference-row",
						children: [/* @__PURE__ */ (0, R.jsx)("div", {
							className: "difference-number",
							children: t + 1
						}), /* @__PURE__ */ (0, R.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [
								/* @__PURE__ */ (0, R.jsx)("h3", {
									className: "font-display text-lg font-black leading-6 text-slate-950",
									children: e.question.prompt
								}),
								/* @__PURE__ */ (0, R.jsxs)("div", {
									className: "mt-4 grid gap-3 md:grid-cols-2",
									children: [/* @__PURE__ */ (0, R.jsxs)("div", {
										className: "answer-quote human-quote",
										children: [/* @__PURE__ */ (0, R.jsxs)("span", { children: [/* @__PURE__ */ (0, R.jsx)(M, { size: 14 }), " Human"] }), /* @__PURE__ */ (0, R.jsx)("p", { children: e.humanAnswer })]
									}), /* @__PURE__ */ (0, R.jsxs)("div", {
										className: "answer-quote persona-quote",
										children: [/* @__PURE__ */ (0, R.jsxs)("span", { children: [
											/* @__PURE__ */ (0, R.jsx)(ne, { size: 14 }),
											" Agent run ",
											n.sequence
										] }), /* @__PURE__ */ (0, R.jsx)("p", { children: e.personaAnswer })]
									})]
								}),
								e.distance !== void 0 && /* @__PURE__ */ (0, R.jsxs)("p", {
									className: "mt-3 text-xs font-bold text-slate-500",
									children: [
										"Scale distance: ",
										e.distance,
										" ",
										e.distance === 1 ? "point" : "points"
									]
								})
							]
						})]
					}, e.question.id)) })]
				}),
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "mx-auto mt-6 max-w-[1080px] rounded-[24px] bg-amber-50 p-5 text-sm leading-6 text-amber-950 sm:flex sm:items-start sm:gap-4 sm:p-6",
					children: [/* @__PURE__ */ (0, R.jsx)(A, {
						className: "mb-3 shrink-0 text-amber-700 sm:mb-0",
						size: 20
					}), /* @__PURE__ */ (0, R.jsxs)("p", { children: [
						/* @__PURE__ */ (0, R.jsx)("strong", { children: "How to read this:" }),
						" This comparison belongs only to Agent run ",
						n.sequence,
						". A named result can match even when individual answers differ, so the question list is the more useful diagnostic."
					] })]
				}),
				/* @__PURE__ */ (0, R.jsxs)("div", {
					className: "mx-auto flex max-w-[1080px] flex-wrap justify-center gap-3 pb-16 pt-8",
					children: [
						/* @__PURE__ */ (0, R.jsxs)("button", {
							type: "button",
							onClick: i,
							className: "primary-button bg-slate-950 focus-ring",
							children: [/* @__PURE__ */ (0, R.jsx)(j, { size: 17 }), " Convergence history"]
						}),
						/* @__PURE__ */ (0, R.jsxs)("button", {
							type: "button",
							onClick: () => r("human"),
							className: "secondary-button focus-ring",
							children: [/* @__PURE__ */ (0, R.jsx)(M, { size: 16 }), " Human result"]
						}),
						/* @__PURE__ */ (0, R.jsxs)("button", {
							type: "button",
							onClick: () => r("agent"),
							className: "secondary-button focus-ring",
							children: [/* @__PURE__ */ (0, R.jsx)(ne, { size: 16 }), " Agent result"]
						}),
						/* @__PURE__ */ (0, R.jsxs)("button", {
							type: "button",
							onClick: a,
							className: "secondary-button focus-ring",
							children: [/* @__PURE__ */ (0, R.jsx)(k, { size: 16 }), " Results"]
						})
					]
				})
			]
		})
	});
}
function Li({ points: e, survey: t }) {
	let n = (0, C.useRef)(null), r = Math.max(1, ...e.map((e) => e.dimensionCount)), i = (e) => 90 + e / r * 622, a = (e) => 22 + (1 - e) * 202, o = Array.from(new Set(Array.from({ length: 5 }, (e, t) => Math.round(r * t / 4)))), s = /* @__PURE__ */ new Map();
	e.forEach((e) => {
		let t = `${e.dimensionCount}:${e.similarity.toFixed(6)}`, n = s.get(t);
		n ? n.runs.push(e) : s.set(t, {
			dimensionCount: e.dimensionCount,
			similarity: e.similarity,
			runs: [e]
		});
	});
	let c = [...s.values()];
	return /* @__PURE__ */ (0, R.jsxs)("figure", {
		className: "chart-shell",
		"aria-labelledby": "convergence-chart-title convergence-chart-description",
		children: [
			/* @__PURE__ */ (0, R.jsx)("h3", {
				id: "convergence-chart-title",
				className: "sr-only",
				children: "Persona dimensions and answer similarity"
			}),
			/* @__PURE__ */ (0, R.jsx)("p", {
				id: "convergence-chart-description",
				className: "sr-only",
				children: "A scatter plot of Agent runs. Persona dimensions are on the horizontal axis and answer similarity from zero to one hundred percent is on the vertical axis. Exact overlaps are grouped, and the table below contains every run."
			}),
			/* @__PURE__ */ (0, R.jsxs)("div", {
				className: "chart-scroll-controls",
				"aria-label": "Chart pan controls",
				children: [/* @__PURE__ */ (0, R.jsxs)("button", {
					type: "button",
					onClick: () => n.current?.scrollBy({
						left: -320,
						behavior: "auto"
					}),
					className: "chart-pan-button focus-ring",
					"aria-label": "Pan chart left",
					children: [/* @__PURE__ */ (0, R.jsx)(D, { size: 15 }), " Left"]
				}), /* @__PURE__ */ (0, R.jsxs)("button", {
					type: "button",
					onClick: () => n.current?.scrollBy({
						left: 320,
						behavior: "auto"
					}),
					className: "chart-pan-button focus-ring",
					"aria-label": "Pan chart right",
					children: ["Right ", /* @__PURE__ */ (0, R.jsx)(te, { size: 15 })]
				})]
			}),
			/* @__PURE__ */ (0, R.jsx)("div", {
				ref: n,
				className: "chart-scroll",
				"aria-label": "Scrollable convergence chart",
				children: /* @__PURE__ */ (0, R.jsxs)("svg", {
					viewBox: "0 0 760 300",
					"aria-hidden": "true",
					focusable: "false",
					className: "chart-svg h-auto w-full",
					children: [
						[
							0,
							.25,
							.5,
							.75,
							1
						].map((e) => /* @__PURE__ */ (0, R.jsxs)("g", { children: [/* @__PURE__ */ (0, R.jsx)("line", {
							x1: 66,
							x2: 732,
							y1: a(e),
							y2: a(e),
							stroke: "#dce2e9",
							strokeDasharray: e === 0 ? void 0 : "4 6"
						}), /* @__PURE__ */ (0, R.jsxs)("text", {
							x: 54,
							y: a(e) + 4,
							textAnchor: "end",
							fontSize: "13",
							fill: "#64748b",
							fontWeight: "700",
							children: [Math.round(e * 100), "%"]
						})] }, e)),
						/* @__PURE__ */ (0, R.jsx)("line", {
							x1: 66,
							x2: 732,
							y1: 224,
							y2: 224,
							stroke: "#94a3b8"
						}),
						o.map((e) => /* @__PURE__ */ (0, R.jsxs)("g", { children: [/* @__PURE__ */ (0, R.jsx)("line", {
							x1: i(e),
							x2: i(e),
							y1: 224,
							y2: 230,
							stroke: "#94a3b8"
						}), /* @__PURE__ */ (0, R.jsx)("text", {
							x: i(e),
							y: 258,
							textAnchor: "middle",
							fontSize: "13",
							fill: "#64748b",
							fontWeight: "700",
							children: e
						})] }, e)),
						/* @__PURE__ */ (0, R.jsx)("text", {
							x: 798 / 2,
							y: 293,
							textAnchor: "middle",
							fontSize: "13",
							fill: "#475569",
							fontWeight: "800",
							children: "Persona dimensions"
						}),
						c.map((e) => {
							let n = e.runs.map((e) => `Run ${e.sequence}`).join(", ");
							return /* @__PURE__ */ (0, R.jsxs)("g", {
								transform: `translate(${i(e.dimensionCount)} ${a(e.similarity)})`,
								children: [
									/* @__PURE__ */ (0, R.jsxs)("title", { children: [
										n,
										", ",
										e.dimensionCount,
										" persona dimensions,",
										" ",
										Math.round(e.similarity * 100),
										" percent similarity"
									] }),
									/* @__PURE__ */ (0, R.jsx)("circle", {
										r: e.runs.length > 1 ? 20 : 18,
										fill: t.pale,
										stroke: t.color,
										strokeWidth: "3"
									}),
									/* @__PURE__ */ (0, R.jsx)("text", {
										textAnchor: "middle",
										y: "4.5",
										fontSize: "12",
										fill: t.ink,
										fontWeight: "900",
										children: e.runs.length > 1 ? `${e.runs.length}x` : e.runs[0].sequence
									})
								]
							}, `${e.dimensionCount}:${e.similarity}`);
						})
					]
				})
			}),
			/* @__PURE__ */ (0, R.jsx)("p", {
				className: "mt-2 text-center text-xs leading-5 text-slate-500",
				children: "Each numbered marker is a completed Agent run. A marker such as 2x groups exact overlaps; every run remains separate in the table."
			})
		]
	});
}
function Ri({ survey: e, history: t, onComparison: n, onHumanResult: r, onHome: i }) {
	let a = t.human, o = Rn(t, a.id).sort(gi), s = Rn(t).filter((e) => e.benchmarkId !== a.id).sort(gi), c = Un(e.id, t), l = Gn(c), u = o.map((t) => ({
		run: t,
		comparison: dn(e, a.answers, t.answers)
	})), d = u.at(-1), f = u.length ? u.reduce((e, t) => t.comparison.similarity > e.comparison.similarity ? t : e) : void 0, p = o.filter((e) => e.dimensionCount === null).length;
	return /* @__PURE__ */ (0, R.jsx)(xi, {
		onHome: i,
		children: /* @__PURE__ */ (0, R.jsxs)("div", {
			className: "history-stage",
			style: pi(e),
			children: [
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "history-heading",
					children: [
						/* @__PURE__ */ (0, R.jsxs)("div", {
							className: "comparison-label",
							children: [
								/* @__PURE__ */ (0, R.jsx)(j, { size: 15 }),
								" ",
								e.shortTitle,
								" experiment"
							]
						}),
						/* @__PURE__ */ (0, R.jsx)("h1", {
							className: "font-display mt-6 max-w-[900px] text-[clamp(2.7rem,7vw,5.8rem)] font-black leading-[0.9] tracking-[-0.06em] text-slate-950",
							children: "Does more persona detail improve the match?"
						}),
						/* @__PURE__ */ (0, R.jsx)("p", {
							className: "mt-6 max-w-[720px] text-base leading-7 text-slate-600",
							children: "Every marker represents one or more Agent runs against the same locally saved Human benchmark. The chart uses answer similarity, not whether the playful type name happened to match."
						}),
						/* @__PURE__ */ (0, R.jsxs)("div", {
							className: "mt-8 flex flex-wrap gap-3",
							children: [
								/* @__PURE__ */ (0, R.jsxs)("span", {
									className: "history-stat",
									children: [/* @__PURE__ */ (0, R.jsx)("small", { children: "Persona agent" }), /* @__PURE__ */ (0, R.jsx)("strong", { children: mi(a.personaAgent) })]
								}),
								/* @__PURE__ */ (0, R.jsxs)("span", {
									className: "history-stat",
									children: [/* @__PURE__ */ (0, R.jsx)("small", { children: "Agent runs" }), /* @__PURE__ */ (0, R.jsx)("strong", { children: o.length })]
								}),
								/* @__PURE__ */ (0, R.jsxs)("span", {
									className: "history-stat",
									children: [/* @__PURE__ */ (0, R.jsx)("small", { children: "Latest match" }), /* @__PURE__ */ (0, R.jsx)("strong", { children: d ? fn(d.comparison.similarity) : "-" })]
								}),
								/* @__PURE__ */ (0, R.jsxs)("span", {
									className: "history-stat",
									children: [/* @__PURE__ */ (0, R.jsx)("small", { children: "Best match" }), /* @__PURE__ */ (0, R.jsx)("strong", { children: f ? fn(f.comparison.similarity) : "-" })]
								}),
								/* @__PURE__ */ (0, R.jsxs)("span", {
									className: "history-stat",
									children: [/* @__PURE__ */ (0, R.jsx)("small", { children: "Latest persona depth" }), /* @__PURE__ */ (0, R.jsx)("strong", { children: d ? d.run.dimensionCount === null ? "Not recorded" : /* @__PURE__ */ (0, R.jsxs)(R.Fragment, { children: [
										d.run.dimensionCount,
										" ",
										/* @__PURE__ */ (0, R.jsx)("em", { children: "dimensions" })
									] }) : "-" })]
								})
							]
						})
					]
				}),
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "mx-auto mt-8 max-w-[1120px] rounded-[30px] bg-white p-5 shadow-sm sm:p-9",
					children: [
						/* @__PURE__ */ (0, R.jsx)("div", {
							className: "flex flex-col justify-between gap-4 sm:flex-row sm:items-start",
							children: /* @__PURE__ */ (0, R.jsxs)("div", { children: [
								/* @__PURE__ */ (0, R.jsx)("p", {
									className: "section-kicker",
									children: "Convergence view"
								}),
								/* @__PURE__ */ (0, R.jsx)("h2", {
									className: "font-display mt-2 text-2xl font-black tracking-[-0.035em] text-slate-950",
									children: l.title
								}),
								/* @__PURE__ */ (0, R.jsx)("p", {
									className: "mt-2 max-w-[720px] text-sm leading-6 text-slate-600",
									children: l.detail
								})
							] })
						}),
						c.length ? /* @__PURE__ */ (0, R.jsx)(Li, {
							points: c,
							survey: e
						}) : /* @__PURE__ */ (0, R.jsxs)("div", {
							className: "empty-match",
							children: [/* @__PURE__ */ (0, R.jsx)(j, {
								size: 34,
								style: { color: e.color }
							}), /* @__PURE__ */ (0, R.jsx)("p", {
								className: "mt-4 max-w-[460px] text-center text-sm leading-6 text-slate-600",
								children: "Start a full Agent experiment from Results to add responses."
							})]
						}),
						p > 0 && /* @__PURE__ */ (0, R.jsxs)("p", {
							className: "mt-5 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900",
							children: [
								p,
								" imported",
								" ",
								p === 1 ? "run is" : "runs are",
								" kept in the history below but excluded from the chart because the persona-dimension count was not recorded."
							]
						})
					]
				}),
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "mx-auto mt-8 max-w-[1120px] rounded-[30px] bg-white p-5 shadow-sm sm:p-9",
					children: [
						/* @__PURE__ */ (0, R.jsxs)("div", {
							className: "pb-6",
							children: [
								/* @__PURE__ */ (0, R.jsx)("p", {
									className: "section-kicker",
									children: "Local run log"
								}),
								/* @__PURE__ */ (0, R.jsx)("h2", {
									className: "font-display mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950",
									children: "Every Agent comparison"
								}),
								/* @__PURE__ */ (0, R.jsx)("p", {
									className: "mt-2 text-sm leading-6 text-slate-600",
									children: "Runs are listed in completion order and never overwrite one another."
								})
							]
						}),
						u.length ? /* @__PURE__ */ (0, R.jsxs)(Rt, {
							className: "mt-4 min-w-[900px]",
							children: [
								/* @__PURE__ */ (0, R.jsx)(Wt, {
									className: "sr-only",
									children: "Agent comparison runs in completion order"
								}),
								/* @__PURE__ */ (0, R.jsx)(zt, { children: /* @__PURE__ */ (0, R.jsxs)(Vt, { children: [
									/* @__PURE__ */ (0, R.jsx)(Ht, { children: "Run" }),
									/* @__PURE__ */ (0, R.jsx)(Ht, { children: "Persona agent" }),
									/* @__PURE__ */ (0, R.jsx)(Ht, { children: "Persona dimensions" }),
									/* @__PURE__ */ (0, R.jsx)(Ht, { children: "Similarity" }),
									/* @__PURE__ */ (0, R.jsx)(Ht, { children: "Exact matches" }),
									/* @__PURE__ */ (0, R.jsx)(Ht, { children: "Completed" }),
									/* @__PURE__ */ (0, R.jsx)(Ht, { children: /* @__PURE__ */ (0, R.jsx)("span", {
										className: "sr-only",
										children: "Action"
									}) })
								] }) }),
								/* @__PURE__ */ (0, R.jsx)(Bt, { children: u.map(({ run: t, comparison: r }) => /* @__PURE__ */ (0, R.jsxs)(Vt, { children: [
									/* @__PURE__ */ (0, R.jsxs)(Ut, {
										className: "font-black text-slate-950",
										children: ["Run ", t.sequence]
									}),
									/* @__PURE__ */ (0, R.jsx)(Ut, { children: mi(t.personaAgent) }),
									/* @__PURE__ */ (0, R.jsx)(Ut, { children: t.dimensionCount ?? "Not recorded" }),
									/* @__PURE__ */ (0, R.jsx)(Ut, { children: /* @__PURE__ */ (0, R.jsx)("span", {
										className: "rounded-full px-2.5 py-1 text-xs font-black",
										style: {
											backgroundColor: e.pale,
											color: e.ink
										},
										children: fn(r.similarity)
									}) }),
									/* @__PURE__ */ (0, R.jsxs)(Ut, { children: [
										r.exactMatches,
										" / ",
										e.questions.length
									] }),
									/* @__PURE__ */ (0, R.jsx)(Ut, { children: di(t.completedAt) }),
									/* @__PURE__ */ (0, R.jsx)(Ut, {
										className: "text-right",
										children: /* @__PURE__ */ (0, R.jsx)("button", {
											type: "button",
											onClick: () => n(t.id),
											className: "quiet-button text-sm font-black hover:text-slate-600 focus-ring",
											children: "View comparison"
										})
									})
								] }, t.id)) })
							]
						}) : /* @__PURE__ */ (0, R.jsxs)("div", {
							className: "empty-match",
							children: [
								/* @__PURE__ */ (0, R.jsx)(ce, {
									size: 34,
									style: { color: e.color }
								}),
								/* @__PURE__ */ (0, R.jsx)("h3", {
									className: "font-display mt-4 text-xl font-black text-slate-950",
									children: "No comparable Agent runs yet"
								}),
								/* @__PURE__ */ (0, R.jsx)("p", {
									className: "mt-2 text-sm text-slate-600",
									children: "The Human benchmark is ready for another experiment."
								})
							]
						}),
						s.length > 0 && /* @__PURE__ */ (0, R.jsxs)("div", {
							className: "mt-6 rounded-2xl bg-amber-50 p-5",
							children: [
								/* @__PURE__ */ (0, R.jsx)("h3", {
									className: "font-display text-lg font-black text-amber-950",
									children: "Unpaired saved results"
								}),
								/* @__PURE__ */ (0, R.jsx)("p", {
									className: "mt-1 text-xs leading-5 text-amber-900",
									children: "These imported results are still stored locally, but they have no matching completed Human benchmark and are excluded from comparisons."
								}),
								/* @__PURE__ */ (0, R.jsx)("div", {
									className: "mt-4 space-y-2",
									children: s.map((t) => {
										let n = ln(e, t.answers);
										return /* @__PURE__ */ (0, R.jsxs)("div", {
											className: "flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 text-sm",
											children: [/* @__PURE__ */ (0, R.jsxs)("span", {
												className: "font-black text-slate-950",
												children: [
													"Run ",
													t.sequence,
													" - ",
													n.title
												]
											}), /* @__PURE__ */ (0, R.jsxs)("span", {
												className: "text-xs font-bold text-slate-500",
												children: [
													mi(t.personaAgent),
													" -",
													" ",
													di(t.completedAt)
												]
											})]
										}, t.id);
									})
								})
							]
						}),
						t.recoveredLegacyDraft && /* @__PURE__ */ (0, R.jsx)("p", {
							className: "mt-5 rounded-xl bg-slate-100 p-3 text-xs leading-5 text-slate-600",
							children: "An unfinished Persona draft from the earlier app version was preserved locally but is not counted as an Agent run. New tracked runs always begin blank."
						})
					]
				}),
				/* @__PURE__ */ (0, R.jsxs)("section", {
					className: "mx-auto mt-6 max-w-[1120px] rounded-[24px] bg-amber-50 p-5 text-sm leading-6 text-amber-950 sm:flex sm:items-start sm:gap-4 sm:p-6",
					children: [/* @__PURE__ */ (0, R.jsx)(A, {
						className: "mb-3 shrink-0 text-amber-700 sm:mb-0",
						size: 20
					}), /* @__PURE__ */ (0, R.jsxs)("p", { children: [/* @__PURE__ */ (0, R.jsx)("strong", { children: "Interpret with care:" }), " A higher score at greater persona depth is a pattern consistent with convergence in this survey. It is not proof of causation or general behavioral fidelity. Repeated runs at the same depth can help reveal variability."] })]
				}),
				/* @__PURE__ */ (0, R.jsxs)("div", {
					className: "mx-auto flex max-w-[1120px] flex-wrap justify-center gap-3 pb-16 pt-8",
					children: [/* @__PURE__ */ (0, R.jsxs)("button", {
						type: "button",
						onClick: r,
						className: "secondary-button focus-ring",
						children: [/* @__PURE__ */ (0, R.jsx)(M, { size: 16 }), " Human benchmark"]
					}), /* @__PURE__ */ (0, R.jsxs)("button", {
						type: "button",
						onClick: i,
						className: "secondary-button focus-ring",
						children: [/* @__PURE__ */ (0, R.jsx)(k, { size: 16 }), " Results"]
					})]
				})
			]
		})
	});
}
function zi({ onHome: e }) {
	return /* @__PURE__ */ (0, R.jsx)(xi, {
		onHome: e,
		children: /* @__PURE__ */ (0, R.jsxs)("article", {
			className: "prose-card",
			children: [
				/* @__PURE__ */ (0, R.jsxs)("button", {
					type: "button",
					onClick: e,
					className: "secondary-button focus-ring",
					children: [/* @__PURE__ */ (0, R.jsx)(D, { size: 16 }), " Results"]
				}),
				/* @__PURE__ */ (0, R.jsx)("p", {
					className: "section-kicker mt-10",
					children: "Sources and license"
				}),
				/* @__PURE__ */ (0, R.jsx)("h1", {
					className: "font-display mt-2 text-4xl font-black tracking-[-0.045em] text-slate-950 sm:text-5xl",
					children: "A playful remix, with credit"
				}),
				/* @__PURE__ */ (0, R.jsx)("p", {
					className: "mt-6 text-base leading-7 text-slate-600",
					children: "The 28-question Internet Creature survey adapts the open-source Silly Big Type Indicator repository. It uses the repository's question bank, four-axis scoring method, and 16 type names under the MIT License. It is not the official sbti.ai experience."
				}),
				/* @__PURE__ */ (0, R.jsx)("p", {
					className: "mt-4 text-base leading-7 text-slate-600",
					children: "The three five-question surveys and all comparison mechanics were created for Mirror Match. Every section is for entertainment and self-reflection only. None is a scientific diagnosis or a suitability assessment."
				}),
				/* @__PURE__ */ (0, R.jsxs)("a", {
					className: "mt-6 inline-flex items-center gap-2 text-sm font-black text-pink-700 underline underline-offset-4",
					href: "https://github.com/SillyBigTypeIndicator/SBTI",
					target: "_blank",
					rel: "noreferrer",
					children: ["View the source repository ", /* @__PURE__ */ (0, R.jsx)(te, { size: 15 })]
				}),
				/* @__PURE__ */ (0, R.jsxs)("div", {
					className: "mt-10 rounded-2xl bg-slate-950 p-6 text-xs leading-6 text-slate-300 sm:p-8",
					children: [
						/* @__PURE__ */ (0, R.jsx)("p", {
							className: "text-white",
							children: "MIT License"
						}),
						/* @__PURE__ */ (0, R.jsx)("p", {
							className: "mt-4",
							children: "Copyright (c) 2026 Silly Big Type Indicator contributors"
						}),
						/* @__PURE__ */ (0, R.jsx)("p", {
							className: "mt-4",
							children: "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:"
						}),
						/* @__PURE__ */ (0, R.jsx)("p", {
							className: "mt-4",
							children: "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software."
						}),
						/* @__PURE__ */ (0, R.jsx)("p", {
							className: "mt-4",
							children: "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE."
						})
					]
				})
			]
		})
	});
}
function Bi({ notice: e }) {
	return /* @__PURE__ */ (0, R.jsxs)("output", {
		className: "validation-save-status",
		"aria-live": "polite",
		children: [/* @__PURE__ */ (0, R.jsx)("span", {
			className: `validation-save-dot ${e.kind}`,
			"aria-hidden": "true"
		}), /* @__PURE__ */ (0, R.jsx)("span", { children: e.message })]
	});
}
function Vi({ hosted: e = !1 }) {
	let [t, n] = (0, C.useState)({}), [r, i] = (0, C.useState)(z), [a, o] = (0, C.useState)(!1), [s, c] = (0, C.useState)(e), [l, u] = (0, C.useState)(null), [d, f] = (0, C.useState)(!1), [p, m] = (0, C.useState)(!1), [h, g] = (0, C.useState)(null), [_, v] = (0, C.useState)(0), y = (0, C.useRef)({}), b = (0, C.useRef)(null), x = (0, C.useRef)({}), S = (0, C.useRef)(void 0), w = (0, C.useRef)(!1), T = (0, C.useRef)(!1), ee = (0, C.useRef)(null), E = (0, C.useRef)(!1), D = (0, C.useRef)(0), te = (0, C.useRef)(!0);
	(0, C.useEffect)(() => {
		y.current = t;
	}, [t]);
	let ne = (0, C.useEffectEvent)(async () => {
		let e = b.current;
		if (!e) return;
		if (w.current) {
			T.current = !0;
			return;
		}
		let t = In(x.current, y.current), r = _r(t);
		if (r === _r(x.current) || r === ee.current) return;
		w.current = !0, u({
			kind: "saving",
			message: "saving to disk..."
		});
		let a = null;
		try {
			try {
				a = await gr(e.contextId, e.saveRevision, t);
			} catch (o) {
				if (!(o instanceof ur) || o.status !== 409 || !o.currentState) throw o;
				let s = o.currentState;
				if (s.contextId !== e.contextId) {
					b.current = s, x.current = s.store, y.current = s.store, ee.current = null, te.current && (n(s.store), i(z), u({
						kind: "saved",
						message: "active persona changed - its results were loaded from disk."
					}));
					return;
				}
				t = In(s.store, y.current), r = _r(t), a = r === _r(s.store) ? s : await gr(s.contextId, s.saveRevision, t);
			}
			b.current = a, x.current = a.store, ee.current = null;
			let o = In(a.store, y.current);
			if (_r(o) !== _r(y.current) && (y.current = o, te.current && n(o)), te.current) {
				let e = fi(a.savedAt);
				u({
					kind: "saved",
					message: e ? `saved to disk at ${e}` : "saved to disk"
				});
			}
		} catch {
			ee.current = r, te.current && u({
				kind: "error",
				message: "changes are not saved to disk - check that the MatrAIx app is running."
			});
		} finally {
			w.current = !1;
			let e = _r(y.current), t = e !== _r(x.current) && e !== ee.current;
			te.current && (T.current || t) && (T.current = !1, v((e) => e + 1));
		}
	});
	(0, C.useEffect)(() => {
		te.current = !0;
		let t = window.requestAnimationFrame(() => {
			c(e || new URLSearchParams(window.location.search).get("embedded") === "1");
		}), r = !1;
		async function i() {
			try {
				let e = await pr(), t = fi(e.savedAt), i = t ? {
					kind: "saved",
					message: `saved to disk at ${t}`
				} : {
					kind: "saved",
					message: "ready - autosave saves to disk"
				};
				if (r) return;
				b.current = e, x.current = e.store, y.current = e.store, n(e.store), u(i);
			} catch {
				if (r) return;
				u({
					kind: "error",
					message: "results could not be loaded from disk - new answers will not be saved."
				});
			}
			o(!0);
		}
		return i(), () => {
			r = !0, te.current = !1, window.cancelAnimationFrame(t), S.current !== void 0 && window.clearTimeout(S.current);
		};
	}, [e]), (0, C.useEffect)(() => {
		if (!a || !b.current) return;
		let e = D.current + 1;
		D.current = e;
		let t = !1, r = !1;
		E.current = !0, m(!1);
		async function o() {
			let a = b.current;
			if (a) try {
				let o = await Mr(Zt, a.contextId);
				if (t) return;
				if (!o.length) {
					r = !0;
					return;
				}
				f(!0), u({
					kind: "saving",
					message: "recovering an unfinished Agent experiment..."
				});
				let s = y.current, c = null, l = 0, d = 0;
				for (let n of o) {
					let r = await Nr(n, Zt, void 0, void 0, (n) => {
						!t && D.current === e && u({
							kind: "saving",
							message: `recovering Agent experiment - ${n.completedRuns} of ${n.requestedRuns} responses complete...`
						});
					});
					s = Rr(s, r, Zt), c = r.batchId, l += r.successes.length, d += r.failures.length;
				}
				if (t) return;
				y.current = s, n(s), c && g(c), i(z), u({
					kind: d ? "error" : "saved",
					message: d ? `${l} recovered Agent responses will be saved. ${d} runs did not finish.` : `${l} Agent responses recovered - saving them to disk.`
				}), r = !0;
			} catch (e) {
				if (t) return;
				u({
					kind: "error",
					message: e instanceof wr ? `${e.message} Reload Validation to recover the saved experiment before starting another.` : "The saved Agent experiment could not be recovered. Reload Validation before starting another."
				});
			} finally {
				!t && D.current === e && (E.current = !1, f(!1), r && m(!0));
			}
		}
		return o(), () => {
			t = !0;
		};
	}, [a]), (0, C.useEffect)(() => {
		if (!a || !b.current) return;
		let e = _r(t);
		if (!(e === _r(x.current) || e === ee.current)) return S.current !== void 0 && window.clearTimeout(S.current), S.current = window.setTimeout(() => {
			S.current = void 0, ne();
		}, 300), () => {
			S.current !== void 0 && (window.clearTimeout(S.current), S.current = void 0);
		};
	}, [
		t,
		a,
		_
	]);
	let re = vi(t, r), O = "surveyId" in r ? Qt[r.surveyId] : void 0;
	function ie(e, t) {
		n((n) => ({
			...n,
			[e]: t(Ln(n, e))
		}));
	}
	function ae() {
		i(z), window.scrollTo({
			top: 0,
			behavior: "smooth"
		});
	}
	function oe() {
		let e = b.current?.personaAgent;
		return e ? { ...e } : (u({
			kind: "error",
			message: "active persona identity is unavailable - reload Validation before starting a run."
		}), null);
	}
	async function k() {
		try {
			let e = await pr(), r = b.current;
			if (r && e.contextId !== r.contextId) return b.current = e, x.current = e.store, y.current = e.store, ee.current = null, n(e.store), i(z), u({
				kind: "saved",
				message: "active persona changed - its results were loaded from disk."
			}), null;
			let a = In(e.store, y.current);
			return b.current = e, x.current = e.store, y.current = a, ee.current = null, _r(a) !== _r(t) && n(a), e;
		} catch {
			return u({
				kind: "error",
				message: "the active persona YAML could not be read - reload Validation before starting a run."
			}), null;
		}
	}
	function A(e) {
		if (E.current) {
			u({
				kind: "saving",
				message: "finish the active Agent experiment before editing benchmarks."
			});
			return;
		}
		let n = Ln(t, e);
		if (n.human?.completedAt) i({
			name: "result",
			surveyId: e,
			actor: "human",
			runId: n.human.id
		});
		else if (n.human) i({
			name: "quiz",
			surveyId: e,
			actor: "human",
			runId: n.human.id
		});
		else {
			let t = oe();
			if (!t) return;
			let n = {
				id: ui("human"),
				answers: {},
				startedAt: (/* @__PURE__ */ new Date()).toISOString(),
				personaAgent: t
			};
			ie(e, (e) => ({
				...e,
				human: n
			})), i({
				name: "quiz",
				surveyId: e,
				actor: "human",
				runId: n.id
			});
		}
		window.scrollTo({ top: 0 });
	}
	async function se({ background: e = !1 } = {}) {
		if (!(!p || E.current)) {
			E.current = !0, f(!0), u({
				kind: "saving",
				message: "running 40 clean Agent responses - 10 concurrent runs for each survey..."
			});
			try {
				let t = await k();
				if (!t) return;
				let r = await Pr(Zt, t.contextId, t.personaRevision, void 0, void 0, (e) => {
					te.current && u({
						kind: "saving",
						message: `running Agent experiment - ${e.completedRuns} of ${e.requestedRuns} responses complete...`
					});
				});
				if (!te.current) return;
				let a = Rr(y.current, r, Zt);
				y.current = a, n(a), g(r.batchId), e || i(z), u({
					kind: r.failures.length ? "error" : "saved",
					message: r.failures.length ? `${r.successes.length} of 40 Agent responses completed and will be saved. ${r.failures.length} failed.` : "40 Agent responses complete - saving the experiment to disk."
				}), e || window.scrollTo({
					top: 0,
					behavior: "smooth"
				});
			} catch (e) {
				if (!te.current) return;
				u({
					kind: "error",
					message: e instanceof wr ? `${e.message} Reload Validation to recover any responses already saved by the experiment.` : "The Agent experiment could not be loaded yet. Reload Validation to recover any saved responses."
				});
			} finally {
				E.current = !1, te.current && f(!1);
			}
		}
	}
	function ce(e, t, n, r, i) {
		let a = (e) => {
			let t = { ...e.answers }, n = new Set(e.clearedAnswers ?? []);
			return i === null ? (delete t[r], n.add(r)) : (t[r] = i, n.delete(r)), {
				answers: t,
				clearedAnswers: n.size ? [...n] : void 0
			};
		};
		ie(e, (e) => t === "human" ? !e.human || e.human.id !== n || e.human.completedAt ? e : {
			...e,
			human: {
				...e.human,
				...a(e.human)
			}
		} : {
			...e,
			agentRuns: e.agentRuns.map((e) => e.id === n && !e.completedAt ? {
				...e,
				...a(e)
			} : e)
		});
	}
	function le(e, n, r) {
		let a = Qt[e], o = Ln(t, e), s = n === "human" ? o.human : Bn(o, r);
		if (!s || a.questions.some((e) => !s.answers[e.id])) return;
		let c = (/* @__PURE__ */ new Date()).toISOString();
		ie(e, (e) => n === "human" ? e.human?.id === r ? Vn({
			...e,
			human: {
				...e.human,
				completedAt: e.human.completedAt ?? c
			}
		}, r) : e : {
			...e,
			agentRuns: e.agentRuns.map((e) => e.id === r ? {
				...e,
				completedAt: e.completedAt ?? c
			} : e)
		}), i({
			name: "result",
			surveyId: e,
			actor: n,
			runId: r
		}), window.scrollTo({
			top: 0,
			behavior: "smooth"
		});
	}
	function j(e) {
		let r = Ln(t, e).agentRuns.length ? "Retake this Human benchmark? Its current answers will be replaced. Saved Agent experiment responses will remain available in Results." : "Retake this Human benchmark? Its current answers will be replaced.";
		if (!window.confirm(r)) return;
		let a = oe();
		if (!a) return;
		let o = {
			id: ui("human"),
			answers: {},
			startedAt: (/* @__PURE__ */ new Date()).toISOString(),
			personaAgent: a
		};
		n((t) => ({
			...t,
			[e]: {
				...Ln(t, e),
				human: o
			}
		})), i({
			name: "quiz",
			surveyId: e,
			actor: "human",
			runId: o.id
		}), window.scrollTo({ top: 0 });
	}
	let M = (0, C.useEffectEvent)(() => {
		se({ background: !0 });
	}), N = (0, C.useEffectEvent)((e) => {
		if (e.name === "home") {
			ae();
			return;
		}
		if (!e.surveyId) return;
		if (e.name === "human") {
			A(e.surveyId);
			return;
		}
		if (e.name === "agent") {
			ae();
			return;
		}
		let n = e.surveyId, r = Ln(t, n);
		(r.human?.completedAt ? Rn(r, r.human.id) : []).length ? (i({
			name: "history",
			surveyId: n
		}), window.scrollTo({ top: 0 })) : r.human?.completedAt ? ae() : A(n);
	});
	(0, C.useEffect)(() => {
		if (!s || !a) return;
		function n() {
			let n = rr(t, re, {
				active: d,
				ready: p
			});
			if (e) {
				window.dispatchEvent(new CustomEvent(Yn, { detail: n }));
				return;
			}
			window.parent.postMessage(n, qn);
		}
		function r(e) {
			if (er(e)) {
				document.documentElement.dataset.validationHostViewport = e.viewport, document.getElementById("validation-root")?.setAttribute("data-validation-host-viewport", e.viewport);
				return;
			}
			if (Qn(e)) {
				n();
				return;
			}
			if ($n(e)) {
				M();
				return;
			}
			if (!tr(e)) return;
			let t = e.target;
			N(t);
		}
		function i(e) {
			e instanceof CustomEvent && r(e.detail);
		}
		function o(e) {
			e.origin !== qn || e.source !== window.parent || r(e.data);
		}
		return e ? window.addEventListener(Jn, i) : window.addEventListener("message", o), n(), () => {
			e ? window.removeEventListener(Jn, i) : window.removeEventListener("message", o);
		};
	}, [
		p,
		s,
		e,
		a,
		re,
		d,
		t
	]);
	function ue() {
		return /* @__PURE__ */ (0, R.jsx)(Ai, {
			store: t,
			onHuman: A,
			onRunAll: () => void se(),
			onLicense: () => i({ name: "license" }),
			runningExperiment: d,
			runDisabled: d || !p,
			selectedExperimentId: h,
			onSelectExperiment: g
		});
	}
	function P() {
		if (!a) return /* @__PURE__ */ (0, R.jsx)("div", { className: "validation-loading min-h-screen" });
		if (r.name === "home") return ue();
		if (r.name === "license") return /* @__PURE__ */ (0, R.jsx)(zi, { onHome: ae });
		if (!O) return null;
		let e = Ln(t, O.id);
		if (r.name === "quiz") {
			let t = r.actor === "human" ? e.human : Bn(e, r.runId);
			return t ? /* @__PURE__ */ (0, R.jsx)(ji, {
				survey: O,
				actor: r.actor,
				run: t,
				agentRun: r.actor === "agent" ? t : void 0,
				onSaveAnswer: (e, t) => ce(r.surveyId, r.actor, r.runId, e, t),
				onComplete: () => le(r.surveyId, r.actor, r.runId),
				onHome: ae
			}, r.runId) : ue();
		}
		if (r.name === "result") {
			let t = r.actor === "human" ? e.human : Bn(e, r.runId);
			if (!t?.completedAt) return ue();
			let n = !!(e.human?.completedAt && (r.actor === "human" || hi(e.human.personaAgent, t.personaAgent)));
			return /* @__PURE__ */ (0, R.jsx)(Pi, {
				survey: O,
				actor: r.actor,
				run: t,
				agentRun: r.actor === "agent" ? t : void 0,
				hasCompletedHuman: n,
				onHistory: () => i({
					name: "history",
					surveyId: r.surveyId
				}),
				onHumanChange: () => j(r.surveyId),
				onHome: ae
			});
		}
		if (r.name === "comparison") {
			let t = Bn(e, r.runId);
			return !e.human?.completedAt || !t?.completedAt || t.benchmarkId !== e.human.id || !hi(e.human.personaAgent, t.personaAgent) ? ue() : /* @__PURE__ */ (0, R.jsx)(Ii, {
				survey: O,
				human: e.human,
				agentRun: t,
				onResult: (n) => i({
					name: "result",
					surveyId: r.surveyId,
					actor: n,
					runId: n === "human" ? e.human.id : t.id
				}),
				onHistory: () => i({
					name: "history",
					surveyId: r.surveyId
				}),
				onHome: ae
			});
		}
		return !e.human?.completedAt || Rn(e, e.human.id).length === 0 ? ue() : /* @__PURE__ */ (0, R.jsx)(Ri, {
			survey: O,
			history: e,
			onComparison: (e) => i({
				name: "comparison",
				surveyId: r.surveyId,
				runId: e
			}),
			onHumanResult: () => i({
				name: "result",
				surveyId: r.surveyId,
				actor: "human",
				runId: e.human.id
			}),
			onHome: ae
		});
	}
	let de = a && re.name !== "license" && l !== null;
	return /* @__PURE__ */ (0, R.jsxs)("div", {
		className: [s ? "validation-embedded" : "", de ? "validation-save-visible" : ""].filter(Boolean).join(" ") || void 0,
		children: [P(), de && /* @__PURE__ */ (0, R.jsx)(Bi, { notice: l })]
	});
}
//#endregion
//#region app/validation-entry.tsx
var Hi = document.getElementById("validation-root");
if (!Hi) throw Error("The Validation mount point was not found.");
var Ui = (0, N.createRoot)(Hi), Wi = 0;
function Gi() {
	Ui.render(/* @__PURE__ */ (0, R.jsx)(Vi, { hosted: !0 }, Wi));
}
window.addEventListener("matraix-validation-reload", () => {
	Wi += 1, Gi();
}), Gi();
//#endregion
