/**
 * Sample JavaScript file for testing the debugger.
 */

function calculateSum(items) {
  let total = 0;
  for (const item of items) {
    total += item;
    if (total > 100) {
      break;
    }
  }
  return total;
}

function main() {
  const numbers = [10, 20, 30, 40, 50];
  const result = calculateSum(numbers);
  console.log(`Sum: ${result}`);

  // Test with larger numbers
  const largeNumbers = [25, 50, 75, 100];
  const result2 = calculateSum(largeNumbers);
  console.log(`Large sum: ${result2}`);
}

main();
