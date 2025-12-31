#!/usr/bin/env python3
"""Sample Python script for testing the debugger."""


def calculate_sum(items):
    """Calculate the sum of item values."""
    total = 0
    for item in items:
        total += item
        if total > 100:
            break
    return total


def main():
    """Main function."""
    numbers = [10, 20, 30, 40, 50]
    result = calculate_sum(numbers)
    print(f"Sum: {result}")

    # Test with larger numbers
    large_numbers = [25, 50, 75, 100]
    result2 = calculate_sum(large_numbers)
    print(f"Large sum: {result2}")


if __name__ == "__main__":
    main()
