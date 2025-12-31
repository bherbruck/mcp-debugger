package main

import "fmt"

func calculate(x, y int) int {
	sum := x + y
	product := x * y
	fmt.Printf("Sum: %d, Product: %d\n", sum, product)
	return sum + product
}

func main() {
	fmt.Println("Starting Go debug test")

	a := 10
	b := 20
	result := calculate(a, b)

	fmt.Printf("Result: %d\n", result)

	items := []int{1, 2, 3, 4, 5}
	total := 0

	for _, item := range items {
		total += item
		fmt.Printf("Running total: %d\n", total)
	}

	fmt.Printf("Final total: %d\n", total)
}
