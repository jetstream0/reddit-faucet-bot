const mongo = require('./mongo.js');

let db = mongo.getDb();

let claims;
let requests;

db.then((db) => {
  console.log("Connected to db")
  claims = db.collection("claims");
  requests = db.collection("requests");
});

//claims

async function find_claim(author, type) {
  return await claims.findOne({
    author,
    type
  });
}

async function add_claim(author, type) {
  let existing_claim = await find_claim(author, type);
  if (!existing_claim) {
    await claims.insertOne({
      last_claim: Date.now(),
      author,
      type,
      claims: 1
    });
  } else {
    existing_claim.last_claim = Date.now();
    existing_claim.claims += 1;
    await claims.replaceOne({
      author,
      type
    }, existing_claim);
  }
}

//requests

async function request_answered(req) {
  delete req["_id"];
  req.answered = true;
  await requests.replaceOne({
    author: req.author,
    type: req.type,
    answered: false
  }, req);
}

async function find_request(author, self) {
  return await requests.findOne({
    author,
    self
  });
}

async function find_unanswered_request(author, self) {
  return await requests.findOne({
    author,
    self,
    answered: false
  });
}

async function add_request(author, self, type, ask) {
  let request_exists = await find_request(author, self);
  if (request_exists) return false;
  await requests.insertOne({
    time: Date.now(),
    answered: false,
    type,
    author,
    self,
    ask
  });
  return true;
}

module.exports = {
  find_claim: find_claim,
  add_claim: add_claim,
  request_answered: request_answered,
  find_request: find_request,
  find_unanswered_request: find_unanswered_request,
  add_request: add_request
}
