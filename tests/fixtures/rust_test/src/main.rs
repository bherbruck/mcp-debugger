fn calculate(x: i32, y: i32) -> i32 {
    let sum = x + y;
    let product = x * y;
    println!("Sum: {}, Product: {}", sum, product);
    sum + product
}

fn main() {
    println!("Starting Rust debug test");

    let a = 10;
    let b = 20;
    let result = calculate(a, b);

    println!("Result: {}", result);

    let items: Vec<i32> = vec![1, 2, 3, 4, 5];
    let mut total = 0;

    for item in &items {
        total += item;
        println!("Running total: {}", total);
    }

    println!("Final total: {}", total);
}
