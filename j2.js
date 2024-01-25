require("dotenv").config();
const QuoterArtifact = require("@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json");
const ethers = require("ethers");
const Web3 = require("web3");
const abis = require("./abis");
const tokens = require("./tokens");
const ArbitrageContractABI = require("./abis/ArbitrageContract.json");

const provider = new ethers.providers.JsonRpcProvider(
  "https://arb-mainnet.g.alchemy.com/v2/b6BZoLf79qBNncYGeYPFqyy6pMapAzLk"
);

const web3 = new Web3(
  new Web3.providers.WebsocketProvider(
    "wss://arb-mainnet.g.alchemy.com/v2/b6BZoLf79qBNncYGeYPFqyy6pMapAzLk"
  )
);
const sushi = new web3.eth.Contract(
  abis.sushiswap,
  "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506"
);

const main = async (tokens) => {
  while (true) {
    const quoterContract = new ethers.Contract(
      "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
      QuoterArtifact.abi,
      provider
    );

    for (let i = 0; i < tokens.length; ) {
      let inputAddress = tokens[i].address;
      let inputDecimals = tokens[i].decimals;
      let fee = 500;
      i++;
      if (i > tokens.length) {
        i = 0;
      }
      for (let j = 0; j < tokens.length; j++) {
        let outputAddress = tokens[j].address;
        let outputDecimals = tokens[j].decimals;

        if (inputAddress == outputAddress) {
          continue;
        }
        const tokensIn = "1000";
        const amountIn = ethers.utils.parseUnits(tokensIn, inputDecimals); // 1 ether in wei
        const quote1 = await quoterContract.callStatic.quoteExactInputSingle(
          inputAddress,
          outputAddress,
          fee,
          amountIn,
          0
        );
        const formattedQuoteIn = ethers.utils.formatUnits(
          quote1,
          outputDecimals
        );
        const amountInWei = ethers.utils.parseUnits(
          formattedQuoteIn,
          outputDecimals
        );
        const weiwei = amountInWei.toString();
        const amountsOut1 = await sushi.methods
          .getAmountsOut(weiwei, [outputAddress, inputAddress])
          .call();
        console.log(
          `Swap ${tokensIn} ${
            i > 0 ? tokens[i - 1].symbol : tokens[i].symbol
          } for ${formattedQuoteIn} ${tokens[j].symbol}`
        );
        console.log(
          `Back on sushiswap: ${web3.utils.fromWei(amountsOut1[1].toString())}`
        );
        if (
          parseFloat(web3.utils.fromWei(amountsOut1[1].toString())) >
          parseFloat(tokensIn)
        ) {
          console.log(parseFloat(tokensIn));
          console.log(
            parseFloat(web3.utils.fromWei(amountsOut1[1].toString()))
          );
          getArbitrage(inputAddress, outputAddress);
        }
      }
    }
  }
};

const getArbitrage = async (token1, token2) => {
  const provider = new ethers.providers.JsonRpcProvider(
    "https://arb-mainnet.g.alchemy.com/v2/b6BZoLf79qBNncYGeYPFqyy6pMapAzLk"
  );

  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const ArbitrageContractAddress = "0x980c84F8e82eeA7017F064DF77A66FBeBB346548"; // Arbitrum

  const ArbitrageContract = new ethers.Contract(
    ArbitrageContractAddress,
    ArbitrageContractABI
  );
  const borrowAsset = token1;
  const amountToBorrow = "1000000"; //Amount to Borrow, Keep the decimal value in Check
  const amount2 = "1000000"; // This Amount will be for your calculation, how much you want to buy
  const uniswapv2Path = [token1, token2];
  const uniswapv3Path = getPath(uniswapv2Path, "500");
  const side = "uniswapv3";

  const tnx = await ArbitrageContract.connect(wallet).makeFlashLoan(
    borrowAsset,
    amountToBorrow,
    amount2,
    uniswapv3Path,
    uniswapv2Path.reverse(),
    side,
    { gasLimit: 7000000 }
  );
  const reciept = await tnx.wait();
};

// getArbitrage(
//   "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8",
//   "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9"
// );

function getPath(tokens, fee) {
  let feeArray = fee.split(",");
  let hexfee = getFee(feeArray);

  let tokenArray = [...tokens.map((x) => x.slice(2))];
  let path = "0x";
  for (let i = 0; i < tokenArray.length; i++) {
    if (i != tokenArray.length - 1) {
      path = path + tokenArray[i].toLowerCase() + hexfee[i];
    } else {
      path = path + tokenArray[i].toLowerCase();
    }
  }
  return path;
}
function getFee(fee) {
  let hexFeeArray = [];
  for (let i = 0; i < fee.length; i++) {
    let hexfee = Number(fee[i]).toString(16);
    if (hexfee.length == 3) {
      hexFeeArray.push("000" + hexfee);
    } else {
      hexFeeArray.push("00" + hexfee);
    }
  }
  return hexFeeArray;
}

main(tokens)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
