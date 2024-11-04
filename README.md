# Check New Architecture Support

This package checks if the libraries used in a React Native project support the new architecture. It leverages the React Native Directory API to verify compatibility and, if not listed, analyzes the GitHub repository for any native dependencies.

## Features

- Checks each library in `package.json` to see if it supports the new architecture.
- Uses React Native Directory API to fetch compatibility data.
- If the library isn't found, it attempts to locate the GitHub repository and analyze if the library is a full JavaScript implementation (indicating new architecture support).

## Installation

Install globally via npm:

```bash
npm install -g rn-chk-new-arch
```

Or run directly with npx:

```bash
npx rn-chk-new-arch
```

## Usage

Run the package in the root directory of your React Native project to check each library's compatibility with the new architecture:

```bash
npx check-new-arch
```

````bash
3 libraries found

Checking libraries...

Library: react-navigation, supports new architecture: true
Library: axios, supports new architecture: false
Library: my-custom-lib, not found
...
--- Statistics ---
Total: 3 | Supported: 1 | Not Supported: 1 | Not Found: 1
```bash

````

## Contributing

Contributions are welcome! If you'd like to improve the package or add new features, please fork the repository and create a pull request.

### Test the library
npm run test

## Development

To download and modify the code:

- Clone the repository:

```bash
git clone https://github.com/your-username/check-new-arch.git
```

- Install dependencies

```bash
npm run build
```

- Compile the TypeScript code:

```bash
npm run build
```

- Run the compiled code:

```bash
npm run start
```

## License

This project is licensed under the MIT License.
