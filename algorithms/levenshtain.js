//= =============================================
//= ==========Algoritmo de Levenshtain===========
//= =============================================
let weights = [];
let MaxPercentWord = [];
// Position 0 : Percent ------- Position 1: Word

// entries = dictionary;
/**
 *
 * @param {*} strg1 string to compare with dictonary
 * @param {*} strings strings to create dictionary
 * @param {*} callback response from function
 */
const compareStrings = (strg1, dictionary) => {
  // generating dictionary
  let entries = dictionary;
  console.log('recibi la palabra:', strg1);
  let k = 0;
  for (let i = 0; i < entries.length; i++) {
    for (let j = 0; j < entries[i].synonym.length; j++) {
      weights[k] = similarity(strg1, entries[i].synonym[j]);
      if (k == 0) {
        MaxPercentWord[0] = weights[k];
        MaxPercentWord[1] = entries[i].value;
      } else if (weights[k] > MaxPercentWord[0]) {
        MaxPercentWord[0] = weights[k];
        MaxPercentWord[1] = entries[i].value;
      }
      k += 1;
    }
  }
  return MaxPercentWord;
};

function editDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  let costs = new Array();
  for (let i = 0; i < s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i == 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) != s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length];
}

function similarity(s1, s2) {
  let longer = s1;
  let shorter = s2;
  if (s1.length < s2.length) {
    longer = s2;
    shorter = s1;
  }
  let longerLength = longer.length;
  if (longerLength === 0) {
    return 1.0;
  }
  let percent =
    (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
  // console.log(s1 + ' y ' + s2 + ' es:               ' + percent);
  return percent;
}

module.exports = {
  compareStrings,
};
