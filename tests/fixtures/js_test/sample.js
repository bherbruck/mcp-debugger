function calculate(x, y) {
  const sum = x + y;
  const product = x * y;
  console.log(`Sum: ${sum}, Product: ${product}`);
  return sum + product;
}

function main() {
  console.log("Starting JS debug test");

  const a = 10;
  const b = 20;
  const result = calculate(a, b);

  console.log(`Result: ${result}`);

  const items = [1, 2, 3, 4, 5];
  let total = 0;

  for (const item of items) {
    total += item;
    console.log(`Running total: ${total}`);
  }

  console.log(`Final total: ${total}`);
}

main();
