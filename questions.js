const fs = require("fs");

const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));

function get_random() {
  return config.questions[Math.floor(config.questions.length * Math.random())];
}

function check_answer(ask, answer) {
  let q = config.questions.find(function(item) {
    return item.ask === ask;
  });
  if (!q) return false;
  if (q.correct.toLowerCase() === answer.toLowerCase().trim()) {
    return true;
  } else {
    return false;
  }
}

module.exports = {
  config: config,
  get_random: get_random,
  check_answer: check_answer
};
