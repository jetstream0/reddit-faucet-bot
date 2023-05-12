const ethers = require('ethers');

const provider = new ethers.providers.JsonRpcProvider("https://nova.arbitrum.io/rpc");

//0x579fE54FC5B275A560b954198C3a3832078DBFF3
let wallet = new ethers.Wallet(process.env.privkey);
wallet = wallet.connect(provider);

const erc20_abi = [
  {
    "constant": false,
    "inputs": [
      {
        "name": "_to",
        "type": "address"
      },
      {
        "name": "_value",
        "type": "uint256"
      }
    ],
    "name": "transfer",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [
      {
        "name": "who",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "name": "",
        "type": "uint256"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

let bricks_token = new ethers.Contract("0x6DcB98f460457fe4952e12779Ba852F82eCC62C1", erc20_abi, wallet);

async function send_arb_eth(address, amount) {
  amount = ethers.utils.parseUnits(String(amount), 18);
  try {
    return (await wallet.sendTransaction({
      to: address,
      value: amount
    })).hash;
  } catch (e) {
    console.log(e);
    return false;
  }
}

async function send_bricks(address, amount) {
  amount = ethers.utils.parseUnits(String(amount), 18);
  try {
    return (await bricks_token.transfer(address, amount)).hash;
  } catch (e) {
    console.log(e);
    return false;
  }
}

module.exports = {
  send_arb_eth: send_arb_eth,
  send_bricks: send_bricks,
  is_valid: ethers.utils.isAddress
}
