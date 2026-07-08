const OPERATOR_PRECEDENCE = { "+": 1, "-": 1, "*": 2, "/": 2 };

function normalizeExpression(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/,/g, ".")
    .replace(/[×xX]/g, "*")
    .replace(/[÷:]/g, "/");
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    const previous = tokens[tokens.length - 1];
    const isUnaryMinus = char === "-" && (!previous || previous.type === "operator" || previous.value === "(");
    if (/\d|\./.test(char) || isUnaryMinus) {
      let number = isUnaryMinus ? "-" : "";
      index += isUnaryMinus ? 1 : 0;
      let dots = 0;
      while (index < expression.length && /[\d.]/.test(expression[index])) {
        if (expression[index] === ".") dots += 1;
        if (dots > 1) throw new Error("Ungültige Zahl");
        number += expression[index];
        index += 1;
      }
      if (number === "-" || number === "." || number === "-.") throw new Error("Ungültige Zahl");
      tokens.push({ type: "number", value: Number(number) });
      continue;
    }
    if ("+-*/".includes(char)) {
      tokens.push({ type: "operator", value: char });
      index += 1;
      continue;
    }
    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }
    throw new Error("Ungültiges Zeichen");
  }
  return tokens;
}

function applyOperator(values, operator) {
  const right = values.pop();
  const left = values.pop();
  if (typeof left !== "number" || typeof right !== "number") throw new Error("Ungültige Rechnung");
  if (operator === "/" && right === 0) throw new Error("Division durch 0");
  const result = operator === "+" ? left + right : operator === "-" ? left - right : operator === "*" ? left * right : left / right;
  if (!Number.isFinite(result)) throw new Error("Ungültiges Ergebnis");
  values.push(result);
}

export function parseCalculatedNumber(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  try {
    const expression = normalizeExpression(value);
    if (!expression) return fallback;
    const tokens = tokenize(expression);
    const values = [];
    const operators = [];
    for (const token of tokens) {
      if (token.type === "number") {
        values.push(token.value);
        continue;
      }
      if (token.value === "(") {
        operators.push(token.value);
        continue;
      }
      if (token.value === ")") {
        while (operators.length && operators[operators.length - 1] !== "(") applyOperator(values, operators.pop());
        if (operators.pop() !== "(") throw new Error("Klammer fehlt");
        continue;
      }
      while (
        operators.length &&
        operators[operators.length - 1] !== "(" &&
        OPERATOR_PRECEDENCE[operators[operators.length - 1]] >= OPERATOR_PRECEDENCE[token.value]
      ) {
        applyOperator(values, operators.pop());
      }
      operators.push(token.value);
    }
    while (operators.length) {
      const operator = operators.pop();
      if (operator === "(") throw new Error("Klammer fehlt");
      applyOperator(values, operator);
    }
    if (values.length !== 1) throw new Error("Ungültige Rechnung");
    return values[0];
  } catch {
    return fallback;
  }
}

export function formatCalculatedNumber(value, decimals = 2) {
  if (String(value ?? "").trim() === "") return "";
  const number = parseCalculatedNumber(value, 0);
  const rounded = Number(number.toFixed(decimals));
  return String(rounded).replace(".", ",");
}

export function isCalculation(value) {
  return /[+\-*/×xX÷:()]/.test(String(value ?? ""));
}
