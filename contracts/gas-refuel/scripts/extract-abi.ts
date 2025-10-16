import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const artifactPath = path.join(
    __dirname,
    '../artifacts/contracts/GasRefuel.sol/GasRefuel.json'
  );

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const abi = artifact.abi;

  console.log('GasRefuel ABI:');
  console.log(JSON.stringify(abi, null, 2));

  // Also save to a file
  const outputPath = path.join(__dirname, '../GasRefuel.abi.json');
  fs.writeFileSync(outputPath, JSON.stringify(abi, null, 2));
  console.log('\n✅ ABI saved to:', outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

