const snoowrap = require('snoowrap');
const snoostorm = require('snoostorm');
const fetch = require('node-fetch');

const keep_alive = require('./keep_alive.js');

const db = require('./db.js');
const faucet = require('./faucet.js');
const questions = require('./questions.js');

//const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const BRICK_CLAIM_INT = questions.config.brick_claim_int || 30 * 24 * 60 * 60 * 1000;
const BRICK_TIME_TEXT = questions.config.brick_time_text || "a month";
const ARB_CLAIM_INT = questions.config.arb_claim_int || 7 * 24 * 60 * 60 * 1000;
const ARB_TIME_TEXT = questions.config.arb_time_text || "a week";

//respond within 2 hours
const RESPOND_WITHIN = 2 * 60 * 60 * 1000;

//init bot account

const BOT = new snoowrap({
  userAgent: 'brickmoons_faucet',
  clientId: 'vLURXcDdMA7D3D5MCQmCRg',
  clientSecret: process.env.reddit_secret,
  username: 'brickmoons_faucet',
  password: process.env.password
});

const comments = new snoostorm.CommentStream(BOT, {
  subreddit: "testingtestingabc",
  limit: 8,
  pollTime: 15000,
});

comments.on("item", async (item) => {
  //console.log(item);
  //bot account listens for comments in subreddit
  //either request for faucet or is answer to vetting question
  //if request, reply with vetting question, add to db (along with info on which faucet it is)
  //if reply, see if exists in db
  //arb eth 1x a week, brick 1x per month
  const author = item.author.name;
  const self = item.id;
  const parent = item.parent_id;
  let text = item.body.toLowerCase().trim();
  //ignore if comment is more than 3 hour old
  if (item.created_utc * 1000 + 3 * 60 * 60 * 1000 < Date.now()) {
    if (text.startsWith("?gasarb") || text.startsWith("?brickme")) {
      console.log("Comment too old");
    }
    return;
  }
  //check karma
  let author_obj = await item.author.fetch();
  const author_id = "t2_" + author_obj.id;
  if (questions.karma_min > author_obj.total_karma) {
    item = await item.expandReplies({ limit: 1 });
    if (item.replies.length > 0) return;
    item.reply("Not enough karma to use faucet! This is an anti-botting feature.");
    return;
  }
  //match with commands
  if (text.startsWith("?gasarb") || text.startsWith("?brickme")) {
    //already seen
    let request = await db.find_request(author, self);
    if (request) return;
    //see if they had recent claim
    let claim = await db.find_claim(author, text.startsWith("?gasarb") ? "arb" : "brick");
    let claim_int;
    if (text.startsWith("?gasarb")) {
      claim_int = ARB_CLAIM_INT;
    } else if (text.startsWith("?brickme")) {
      claim_int = BRICK_CLAIM_INT;
    }
    if (claim) {
      if (Date.now() < claim.last_claim + claim_int) {
        item = await item.expandReplies({ limit: 1 });
        if (item.replies.length > 0) return;
        item.reply("Last claim too soon. Come back later.");
        return;
      }
    }
    //get random question, ask
    let q = questions.get_random();
    try {
      item.reply(`## Almost There!\n\nTo prevent botting, here is a quick question to answer: ${q.ask}\n\n${q.options.join("\n\n")}\n\n**You must reply in the following format, example: \`Answer: Cheese\`**, otherwise you will not receive anything. Please respond **within two hours**.`);
    } catch (e) {
      //failed to reply, probably ratelimits?
      console.log(e);
      return;
    }
    //create new request
    if (text.startsWith("?gasarb")) {
      await db.add_request(author, self, "arb", q.ask);
    } else if (text.startsWith("?brickme")) {
      await db.add_request(author, self, "brick", q.ask);
    }
    return;
  } else if (text.startsWith("answer: ")) {
    //check if it be a response to a request
    let parent_comment = await BOT.getComment(parent).fetch();
    let grandparent = parent_comment.parent_id?.split("_")[1];
    //if no grandparent, parent is probably a post
    if (!grandparent) return;
    let request = await db.find_unanswered_request(author, grandparent);
    if (!request) return;
    //make sure request did not expire
    if (request.time + RESPOND_WITHIN < Date.now()) {
      console.log("Request expired");
      return;
    }
    await db.request_answered(request);
    //is a response to a request, check answers
    let answer = text.replace("answer: ", "").toLowerCase().trim();
    //check if answer is correct
    let correct = questions.check_answer(request.ask, answer);
    if (!correct) {
      item.reply("Incorrect answer! Please request faucet again to try again.");
      return;
    }
    //get their address
    //https://www.reddit.com/community-points/documentation/developers
    //r/cc: t5_2wlj3
    //r/fortnitebr: t5_3oeyf
    let address;
    let resp = await fetch(`https://meta-api.reddit.com/wallets/t5_2wlj3?userIds=${author_id}`);
    resp = await resp.json();
    resp = resp[author_id];
    if (resp) {
      address = resp.publicAddress;
    } else {
      //try with fortnite now
      resp = await fetch(`https://meta-api.reddit.com/wallets/t5_2wlj3?userIds=${author_id}`);
      resp = await resp.json();
      resp = resp[author_id];
      if (resp) {
        address = resp.publicAddress;
      } else {
        item.reply("Error, could not find your vault address. Is it opened?");
        return;
      }
    }
    //send them
    console.log(`Sending ${request.type} to ${author}`);
    if (request.type === "arb") {
      let tx = await faucet.send_arb_eth(address, questions.config.arb_amount);
      if (!tx) {
        item.reply("Send failed! Try again later.");
        return;
      }
      await db.add_claim(author, "arb");
      item.reply(`## Success!\nYou have been [sent](https://nova-explorer.arbitrum.io/tx/${tx}) ${questions.config.arb_amount} Arb ETH. You can claim again in ${ARB_TIME_TEXT}.`);
      return;
    } else if (request.type === "brick") {
      let tx = await faucet.send_bricks(address, questions.config.bricks_amount);
      if (!tx) {
        item.reply("Send failed! Try again later.");
        return;
      }
      await db.add_claim(author, "brick");
      item.reply(`## Success!\nYou have been [sent](https://nova-explorer.arbitrum.io/tx/${tx}) ${questions.config.bricks_amount} Brick (s). You can claim again in ${BRICK_TIME_TEXT}.`);
      return;
    }
    return;
  }
});
