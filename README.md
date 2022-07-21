# Master Contract Template

This is for new contract Repo

## Setup

```
yarn install
forge build
```

## Test

### Running all tests

```
npx hardhat test
```

### Run foundry test

```
forge test --fork-url $BSC_URL
```

### Running specific tests

```
npx hardhat test --grep "<YOUR TARGET TESTS KEYWORD>"
```

### Inspect transactions on ethernal

Make sure ethernal is installed: https://doc.tryethernal.com/getting-started/quickstart

Spin up local node

```
npx hardhat node --fork <NODE RPC URL>
```

Turn on ethernal listener

```
ethernal listen
```

Import ethernal to the test script

```typescript
import 'hardhat-ethernal'
```

Run test case with ethernal credentials. Connect it to local node.

```
ETHERNAL_EMAIL=<YOUR EMAIL> ETHERNAL_PASSWORD=<YOUR PASSWORD> npx hardhat run <FILE PATH> --network localhost
```

Login and browse the transactions at https://app.tryethernal.com

