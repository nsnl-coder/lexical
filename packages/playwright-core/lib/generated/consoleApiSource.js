"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.source = void 0;
const source = "// packages/playwright-core/src/utils/isomorphic/stringUtils.ts\nfunction escapeWithQuotes(text, char = \"'\") {\n  const stringified = JSON.stringify(text);\n  const escapedText = stringified.substring(1, stringified.length - 1).replace(/\\\\\"/g, '\"');\n  if (char === \"'\")\n    return char + escapedText.replace(/[']/g, \"\\\\'\") + char;\n  if (char === '\"')\n    return char + escapedText.replace(/[\"]/g, '\\\\\"') + char;\n  if (char === \"`\")\n    return char + escapedText.replace(/[`]/g, \"`\") + char;\n  throw new Error(\"Invalid escape char\");\n}\n\n// packages/playwright-core/src/server/injected/selectorUtils.ts\nfunction shouldSkipForTextMatching(element) {\n  return element.nodeName === \"SCRIPT\" || element.nodeName === \"STYLE\" || document.head && document.head.contains(element);\n}\nfunction elementText(cache, root) {\n  let value = cache.get(root);\n  if (value === void 0) {\n    value = { full: \"\", immediate: [] };\n    if (!shouldSkipForTextMatching(root)) {\n      let currentImmediate = \"\";\n      if (root instanceof HTMLInputElement && (root.type === \"submit\" || root.type === \"button\")) {\n        value = { full: root.value, immediate: [root.value] };\n      } else {\n        for (let child = root.firstChild; child; child = child.nextSibling) {\n          if (child.nodeType === Node.TEXT_NODE) {\n            value.full += child.nodeValue || \"\";\n            currentImmediate += child.nodeValue || \"\";\n          } else {\n            if (currentImmediate)\n              value.immediate.push(currentImmediate);\n            currentImmediate = \"\";\n            if (child.nodeType === Node.ELEMENT_NODE)\n              value.full += elementText(cache, child).full;\n          }\n        }\n        if (currentImmediate)\n          value.immediate.push(currentImmediate);\n        if (root.shadowRoot)\n          value.full += elementText(cache, root.shadowRoot).full;\n      }\n    }\n    cache.set(root, value);\n  }\n  return value;\n}\n\n// packages/playwright-core/src/server/injected/selectorGenerator.ts\nvar cacheAllowText = /* @__PURE__ */ new Map();\nvar cacheDisallowText = /* @__PURE__ */ new Map();\nvar kNthScore = 1e3;\nfunction generateSelector(injectedScript, targetElement, strict) {\n  injectedScript._evaluator.begin();\n  try {\n    targetElement = targetElement.closest(\"button,select,input,[role=button],[role=checkbox],[role=radio]\") || targetElement;\n    const targetTokens = generateSelectorFor(injectedScript, targetElement, strict);\n    const bestTokens = targetTokens || cssFallback(injectedScript, targetElement, strict);\n    const selector = joinTokens(bestTokens);\n    const parsedSelector = injectedScript.parseSelector(selector);\n    return {\n      selector,\n      elements: injectedScript.querySelectorAll(parsedSelector, targetElement.ownerDocument)\n    };\n  } finally {\n    cacheAllowText.clear();\n    cacheDisallowText.clear();\n    injectedScript._evaluator.end();\n  }\n}\nfunction filterRegexTokens(textCandidates) {\n  return textCandidates.filter((c) => c[0].selector[0] !== \"/\");\n}\nfunction generateSelectorFor(injectedScript, targetElement, strict) {\n  if (targetElement.ownerDocument.documentElement === targetElement)\n    return [{ engine: \"css\", selector: \"html\", score: 1 }];\n  const calculate = (element, allowText) => {\n    const allowNthMatch = element === targetElement;\n    let textCandidates = allowText ? buildTextCandidates(injectedScript, element, element === targetElement).map((token) => [token]) : [];\n    if (element !== targetElement) {\n      textCandidates = filterRegexTokens(textCandidates);\n    }\n    const noTextCandidates = buildCandidates(injectedScript, element).map((token) => [token]);\n    let result = chooseFirstSelector(injectedScript, targetElement.ownerDocument, element, [...textCandidates, ...noTextCandidates], allowNthMatch, strict);\n    textCandidates = filterRegexTokens(textCandidates);\n    const checkWithText = (textCandidatesToUse) => {\n      const allowParentText = allowText && !textCandidatesToUse.length;\n      const candidates = [...textCandidatesToUse, ...noTextCandidates].filter((c) => {\n        if (!result)\n          return true;\n        return combineScores(c) < combineScores(result);\n      });\n      let bestPossibleInParent = candidates[0];\n      if (!bestPossibleInParent)\n        return;\n      for (let parent = parentElementOrShadowHost(element); parent; parent = parentElementOrShadowHost(parent)) {\n        const parentTokens = calculateCached(parent, allowParentText);\n        if (!parentTokens)\n          continue;\n        if (result && combineScores([...parentTokens, ...bestPossibleInParent]) >= combineScores(result))\n          continue;\n        bestPossibleInParent = chooseFirstSelector(injectedScript, parent, element, candidates, allowNthMatch, strict);\n        if (!bestPossibleInParent)\n          return;\n        const combined = [...parentTokens, ...bestPossibleInParent];\n        if (!result || combineScores(combined) < combineScores(result))\n          result = combined;\n      }\n    };\n    checkWithText(textCandidates);\n    if (element === targetElement && textCandidates.length)\n      checkWithText([]);\n    return result;\n  };\n  const calculateCached = (element, allowText) => {\n    const cache = allowText ? cacheAllowText : cacheDisallowText;\n    let value = cache.get(element);\n    if (value === void 0) {\n      value = calculate(element, allowText);\n      cache.set(element, value);\n    }\n    return value;\n  };\n  return calculateCached(targetElement, true);\n}\nfunction buildCandidates(injectedScript, element) {\n  const candidates = [];\n  for (const attribute of [\"data-testid\", \"data-test-id\", \"data-test\"]) {\n    if (element.getAttribute(attribute))\n      candidates.push({ engine: \"css\", selector: `[${attribute}=${quoteAttributeValue(element.getAttribute(attribute))}]`, score: 1 });\n  }\n  if (element.nodeName === \"INPUT\") {\n    const input = element;\n    if (input.placeholder)\n      candidates.push({ engine: \"css\", selector: `[placeholder=${quoteAttributeValue(input.placeholder)}]`, score: 10 });\n  }\n  if (element.getAttribute(\"aria-label\"))\n    candidates.push({ engine: \"css\", selector: `[aria-label=${quoteAttributeValue(element.getAttribute(\"aria-label\"))}]`, score: 10 });\n  if (element.getAttribute(\"alt\") && [\"APPLET\", \"AREA\", \"IMG\", \"INPUT\"].includes(element.nodeName))\n    candidates.push({ engine: \"css\", selector: `${cssEscape(element.nodeName.toLowerCase())}[alt=${quoteAttributeValue(element.getAttribute(\"alt\"))}]`, score: 10 });\n  if (element.getAttribute(\"role\"))\n    candidates.push({ engine: \"css\", selector: `${cssEscape(element.nodeName.toLowerCase())}[role=${quoteAttributeValue(element.getAttribute(\"role\"))}]`, score: 50 });\n  if (element.getAttribute(\"name\") && [\"BUTTON\", \"FORM\", \"FIELDSET\", \"IFRAME\", \"INPUT\", \"KEYGEN\", \"OBJECT\", \"OUTPUT\", \"SELECT\", \"TEXTAREA\", \"MAP\", \"META\", \"PARAM\"].includes(element.nodeName))\n    candidates.push({ engine: \"css\", selector: `${cssEscape(element.nodeName.toLowerCase())}[name=${quoteAttributeValue(element.getAttribute(\"name\"))}]`, score: 50 });\n  if ([\"INPUT\", \"TEXTAREA\"].includes(element.nodeName) && element.getAttribute(\"type\") !== \"hidden\") {\n    if (element.getAttribute(\"type\"))\n      candidates.push({ engine: \"css\", selector: `${cssEscape(element.nodeName.toLowerCase())}[type=${quoteAttributeValue(element.getAttribute(\"type\"))}]`, score: 50 });\n  }\n  if ([\"INPUT\", \"TEXTAREA\", \"SELECT\"].includes(element.nodeName))\n    candidates.push({ engine: \"css\", selector: cssEscape(element.nodeName.toLowerCase()), score: 50 });\n  const idAttr = element.getAttribute(\"id\");\n  if (idAttr && !isGuidLike(idAttr))\n    candidates.push({ engine: \"css\", selector: makeSelectorForId(idAttr), score: 100 });\n  candidates.push({ engine: \"css\", selector: cssEscape(element.nodeName.toLowerCase()), score: 200 });\n  return candidates;\n}\nfunction buildTextCandidates(injectedScript, element, allowHasText) {\n  if (element.nodeName === \"SELECT\")\n    return [];\n  const text = elementText(injectedScript._evaluator._cacheText, element).full.trim().replace(/\\s+/g, \" \").substring(0, 80);\n  if (!text)\n    return [];\n  const candidates = [];\n  let escaped = text;\n  if (text.includes('\"') || text.includes(\">>\") || text[0] === \"/\")\n    escaped = `/.*${escapeForRegex(text)}.*/`;\n  candidates.push({ engine: \"text\", selector: escaped, score: 10 });\n  if (allowHasText && escaped === text) {\n    let prefix = element.nodeName.toLowerCase();\n    if (element.hasAttribute(\"role\"))\n      prefix += `[role=${quoteAttributeValue(element.getAttribute(\"role\"))}]`;\n    candidates.push({ engine: \"css\", selector: `${prefix}:has-text(\"${text}\")`, score: 30 });\n  }\n  return candidates;\n}\nfunction parentElementOrShadowHost(element) {\n  if (element.parentElement)\n    return element.parentElement;\n  if (!element.parentNode)\n    return null;\n  if (element.parentNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE && element.parentNode.host)\n    return element.parentNode.host;\n  return null;\n}\nfunction makeSelectorForId(id) {\n  return /^[a-zA-Z][a-zA-Z0-9\\-\\_]+$/.test(id) ? \"#\" + id : `[id=\"${cssEscape(id)}\"]`;\n}\nfunction cssFallback(injectedScript, targetElement, strict) {\n  const kFallbackScore = 1e7;\n  const root = targetElement.ownerDocument;\n  const tokens = [];\n  function uniqueCSSSelector(prefix) {\n    const path = tokens.slice();\n    if (prefix)\n      path.unshift(prefix);\n    const selector = path.join(\" > \");\n    const parsedSelector = injectedScript.parseSelector(selector);\n    const node = injectedScript.querySelector(parsedSelector, targetElement.ownerDocument, false);\n    return node === targetElement ? selector : void 0;\n  }\n  function makeStrict(selector) {\n    const token = { engine: \"css\", selector, score: kFallbackScore };\n    if (!strict)\n      return [token];\n    const parsedSelector = injectedScript.parseSelector(selector);\n    const elements = injectedScript.querySelectorAll(parsedSelector, targetElement.ownerDocument);\n    if (elements.length === 1)\n      return [token];\n    const nth = { engine: \"nth\", selector: String(elements.indexOf(targetElement)), score: kNthScore };\n    return [token, nth];\n  }\n  for (let element = targetElement; element && element !== root; element = parentElementOrShadowHost(element)) {\n    const nodeName = element.nodeName.toLowerCase();\n    let bestTokenForLevel = \"\";\n    if (element.id) {\n      const token = makeSelectorForId(element.id);\n      const selector = uniqueCSSSelector(token);\n      if (selector)\n        return makeStrict(selector);\n      bestTokenForLevel = token;\n    }\n    const parent = element.parentNode;\n    const classes = [...element.classList];\n    for (let i = 0; i < classes.length; ++i) {\n      const token = \".\" + classes.slice(0, i + 1).join(\".\");\n      const selector = uniqueCSSSelector(token);\n      if (selector)\n        return makeStrict(selector);\n      if (!bestTokenForLevel && parent) {\n        const sameClassSiblings = parent.querySelectorAll(token);\n        if (sameClassSiblings.length === 1)\n          bestTokenForLevel = token;\n      }\n    }\n    if (parent) {\n      const siblings = [...parent.children];\n      const sameTagSiblings = siblings.filter((sibling) => sibling.nodeName.toLowerCase() === nodeName);\n      const token = sameTagSiblings.indexOf(element) === 0 ? cssEscape(nodeName) : `${cssEscape(nodeName)}:nth-child(${1 + siblings.indexOf(element)})`;\n      const selector = uniqueCSSSelector(token);\n      if (selector)\n        return makeStrict(selector);\n      if (!bestTokenForLevel)\n        bestTokenForLevel = token;\n    } else if (!bestTokenForLevel) {\n      bestTokenForLevel = nodeName;\n    }\n    tokens.unshift(bestTokenForLevel);\n  }\n  return makeStrict(uniqueCSSSelector());\n}\nfunction escapeForRegex(text) {\n  return text.replace(/[.*+?^>${}()|[\\]\\\\]/g, \"\\\\$&\");\n}\nfunction quoteAttributeValue(text) {\n  return `\"${cssEscape(text).replace(/\\\\ /g, \" \")}\"`;\n}\nfunction joinTokens(tokens) {\n  const parts = [];\n  let lastEngine = \"\";\n  for (const { engine, selector } of tokens) {\n    if (parts.length && (lastEngine !== \"css\" || engine !== \"css\" || selector.startsWith(\":nth-match(\")))\n      parts.push(\">>\");\n    lastEngine = engine;\n    if (engine === \"css\")\n      parts.push(selector);\n    else\n      parts.push(`${engine}=${selector}`);\n  }\n  return parts.join(\" \");\n}\nfunction combineScores(tokens) {\n  let score = 0;\n  for (let i = 0; i < tokens.length; i++)\n    score += tokens[i].score * (tokens.length - i);\n  return score;\n}\nfunction chooseFirstSelector(injectedScript, scope, targetElement, selectors, allowNthMatch, strict) {\n  const joined = selectors.map((tokens) => ({ tokens, score: combineScores(tokens) }));\n  joined.sort((a, b) => a.score - b.score);\n  let bestWithIndex = null;\n  for (const { tokens } of joined) {\n    const parsedSelector = injectedScript.parseSelector(joinTokens(tokens));\n    const result = injectedScript.querySelectorAll(parsedSelector, scope);\n    const isStrictEnough = !strict || result.length === 1;\n    const index = result.indexOf(targetElement);\n    if (index === 0 && isStrictEnough) {\n      return tokens;\n    }\n    if (!allowNthMatch || bestWithIndex || index === -1 || result.length > 5)\n      continue;\n    const nth = { engine: \"nth\", selector: String(index), score: kNthScore };\n    bestWithIndex = [...tokens, nth];\n  }\n  return bestWithIndex;\n}\nfunction isGuidLike(id) {\n  let lastCharacterType;\n  let transitionCount = 0;\n  for (let i = 0; i < id.length; ++i) {\n    const c = id[i];\n    let characterType;\n    if (c === \"-\" || c === \"_\")\n      continue;\n    if (c >= \"a\" && c <= \"z\")\n      characterType = \"lower\";\n    else if (c >= \"A\" && c <= \"Z\")\n      characterType = \"upper\";\n    else if (c >= \"0\" && c <= \"9\")\n      characterType = \"digit\";\n    else\n      characterType = \"other\";\n    if (characterType === \"lower\" && lastCharacterType === \"upper\") {\n      lastCharacterType = characterType;\n      continue;\n    }\n    if (lastCharacterType && lastCharacterType !== characterType)\n      ++transitionCount;\n    lastCharacterType = characterType;\n  }\n  return transitionCount >= id.length / 4;\n}\nfunction cssEscape(s) {\n  let result = \"\";\n  for (let i = 0; i < s.length; i++)\n    result += cssEscapeOne(s, i);\n  return result;\n}\nfunction cssEscapeOne(s, i) {\n  const c = s.charCodeAt(i);\n  if (c === 0)\n    return \"\\uFFFD\";\n  if (c >= 1 && c <= 31 || c >= 48 && c <= 57 && (i === 0 || i === 1 && s.charCodeAt(0) === 45))\n    return \"\\\\\" + c.toString(16) + \" \";\n  if (i === 0 && c === 45 && s.length === 1)\n    return \"\\\\\" + s.charAt(i);\n  if (c >= 128 || c === 45 || c === 95 || c >= 48 && c <= 57 || c >= 65 && c <= 90 || c >= 97 && c <= 122)\n    return s.charAt(i);\n  return \"\\\\\" + s.charAt(i);\n}\n\n// packages/playwright-core/src/server/injected/consoleApi.ts\nfunction createLocator(injectedScript, initial, options) {\n  class Locator {\n    constructor(selector, options2) {\n      this.selector = selector;\n      if (options2 == null ? void 0 : options2.hasText) {\n        const text = options2.hasText;\n        if (text instanceof RegExp)\n          this.selector += ` >> :scope:text-matches(${escapeWithQuotes(text.source, '\"')}, \"${text.flags}\")`;\n        else\n          this.selector += ` >> :scope:has-text(${escapeWithQuotes(text)})`;\n      }\n      if (options2 == null ? void 0 : options2.has)\n        this.selector += ` >> has=` + JSON.stringify(options2.has.selector);\n      const parsed = injectedScript.parseSelector(this.selector);\n      this.element = injectedScript.querySelector(parsed, document, false);\n      this.elements = injectedScript.querySelectorAll(parsed, document);\n    }\n    locator(selector, options2) {\n      return new Locator(this.selector ? this.selector + \" >> \" + selector : selector, options2);\n    }\n  }\n  return new Locator(initial, options);\n}\nvar ConsoleAPI = class {\n  constructor(injectedScript) {\n    this._injectedScript = injectedScript;\n    if (window.playwright)\n      return;\n    window.playwright = {\n      $: (selector, strict) => this._querySelector(selector, !!strict),\n      $$: (selector) => this._querySelectorAll(selector),\n      locator: (selector, options) => createLocator(this._injectedScript, selector, options),\n      inspect: (selector) => this._inspect(selector),\n      selector: (element) => this._selector(element),\n      resume: () => this._resume()\n    };\n  }\n  _querySelector(selector, strict) {\n    if (typeof selector !== \"string\")\n      throw new Error(`Usage: playwright.query('Playwright >> selector').`);\n    const parsed = this._injectedScript.parseSelector(selector);\n    return this._injectedScript.querySelector(parsed, document, strict);\n  }\n  _querySelectorAll(selector) {\n    if (typeof selector !== \"string\")\n      throw new Error(`Usage: playwright.$$('Playwright >> selector').`);\n    const parsed = this._injectedScript.parseSelector(selector);\n    return this._injectedScript.querySelectorAll(parsed, document);\n  }\n  _inspect(selector) {\n    if (typeof selector !== \"string\")\n      throw new Error(`Usage: playwright.inspect('Playwright >> selector').`);\n    window.inspect(this._querySelector(selector, false));\n  }\n  _selector(element) {\n    if (!(element instanceof Element))\n      throw new Error(`Usage: playwright.selector(element).`);\n    return generateSelector(this._injectedScript, element, true).selector;\n  }\n  _resume() {\n    window.__pw_resume().catch(() => {\n    });\n  }\n};\nmodule.exports = ConsoleAPI;\n";
exports.source = source;