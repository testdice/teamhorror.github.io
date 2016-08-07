 // Untitled Dice v0.0.8
 
// Customize these configuration settings:

var config = {
  // - Your app's id on moneypot.com
  app_id: 689,                             // <----------------------------- EDIT ME!
  // - Displayed in the navbar
  app_name: 'teamhorror' ,
  // - For your faucet to work, you must register your site at Recaptcha
  // - https://www.google.com/recaptcha/intro/index.html
  recaptcha_sitekey: '6LdLiBATAAAAAJxq_vT5QGJZ0ONoyh1HdxPGv5e3',  // <----- EDIT ME!
  redirect_uri: 'https://teamhorror.github.io',
  mp_browser_uri: 'https://www.moneypot.com',
  mp_api_uri: 'https://api.moneypot.com',
  chat_uri: '//socket.moneypot.com',
  // - Show debug output only if running on localhost
  debug: isRunningLocally(),
  // - Set this to true if you want users that come to http:// to be redirected
  //   to https://
  force_https_redirect: !isRunningLocally(),
  // - Configure the house edge (default is 1%)
  //   Must be between 0.0 (0%) and 1.0 (100%)
  house_edge: 0.0111, 
  chat_buffer_size: 10, 
  // - The amount of bets to show on screen in each tab
  bet_buffer_size: 10
};
 
////////////////////////////////////////////////////////////
// You shouldn't have to edit anything below this line
////////////////////////////////////////////////////////////
function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}
// Validate the configured house edge
(function() {
  var errString;

  if (config.house_edge <= 0.0) {
    errString = 'House edge must be > 0.0 (0%)';
  } else if (config.house_edge >= 100.0) {
    errString = 'House edge must be < 1.0 (100%)';
  }

  if (errString) {
    alert(errString);
    throw new Error(errString);
  }

  // Sanity check: Print house edge
  console.log('House Edge:', (config.house_edge * 100).toString() + '%');
})();

////////////////////////////////////////////////////////////

if (config.force_https_redirect && window.location.protocol !== "https:") {
  window.location.href = "https:" + window.location.href.substring(window.location.protocol.length);
}

// Hoist it. It's impl'd at bottom of page.
var socket;

// :: Bool
function isRunningLocally() {
  return /^localhost/.test(window.location.host);
}

var el = React.DOM;

// Generates UUID for uniquely tagging components
var genUuid = function() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
};

var helpers = {};

// For displaying HH:MM timestamp in chat
//
// String (Date JSON) -> String
helpers.formatDateToTime = function(dateJson) {
  var date = new Date(dateJson);
  return _.padLeft(date.getHours().toString(), 2, '0') +
    ':' +
    _.padLeft(date.getMinutes().toString(), 2, '0');
};

// Number -> Number in range (0, 1)
helpers.multiplierToWinProb = function(multiplier) {
  console.assert(typeof multiplier === 'number');
  console.assert(multiplier > 0);

  // For example, n is 0.99 when house edge is 1%
  var n = 1.0 - config.house_edge;

  return n / multiplier;
};

helpers.calcNumber = function(cond, winProb) {
  console.assert(cond === '<' || cond === '>');
  console.assert(typeof winProb === 'number');

  if (cond === '<') {
    return winProb * 100;
  } else {
    return 99.99 - (winProb * 100);
  }
};

helpers.roleToLabelElement = function(role, uname) {
  switch(role) {
    case 'ADMIN':
      return el.span({className: 'label label-'}, 'MP Staff');
    case 'MOD':
      return el.span({className: 'label label-info'}, '★');
    case 'OWNER':
      return el.span({className: 'label label-info'}, '★');
    default:
      if ((uname == "chatbot") || (uname == "Chatbot")) {
       return el.span({className: 'label label-success'}, 'Bot');
      } else {
       return el.span({className: 'label label-primary'}, '★');
      }
  }
};

// -> Object
helpers.getHashParams = function() {
  var hashParams = {};
  var e,
      a = /\+/g,  // Regex for replacing addition symbol with a space
      r = /([^&;=]+)=?([^&;]*)/g,
      d = function (s) { return decodeURIComponent(s.replace(a, " ")); },
      q = window.location.hash.substring(1);
  while (e = r.exec(q))
    hashParams[d(e[1])] = d(e[2]);
  return hashParams;
};

// getPrecision('1') -> 0
// getPrecision('.05') -> 2
// getPrecision('25e-100') -> 100
// getPrecision('2.5e-99') -> 100
helpers.getPrecision = function(num) {
  var match = (''+num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) { return 0; }
  return Math.max(
    0,
    // Number of digits right of decimal point.
    (match[1] ? match[1].length : 0) -
    // Adjust for scientific notation.
    (match[2] ? +match[2] : 0));
};

/**
 * Decimal adjustment of a number.
 *
 * @param {String}  type  The type of adjustment.
 * @param {Number}  value The number.
 * @param {Integer} exp   The exponent (the 10 logarithm of the adjustment base).
 * @returns {Number} The adjusted value.
 */
helpers.decimalAdjust = function(type, value, exp) {
  // If the exp is undefined or zero...
  if (typeof exp === 'undefined' || +exp === 0) {
    return Math[type](value);
  }
  value = +value;
  exp = +exp;
  // If the value is not a number or the exp is not an integer...
  if (isNaN(value) || !(typeof exp === 'number' && exp % 1 === 0)) {
    return NaN;
  }
  // Shift
  value = value.toString().split('e');
  value = Math[type](+(value[0] + 'e' + (value[1] ? (+value[1] - exp) : -exp)));
  // Shift back
  value = value.toString().split('e');
  return +(value[0] + 'e' + (value[1] ? (+value[1] + exp) : exp));
}

helpers.round10 = function(value, exp) {
  return helpers.decimalAdjust('round', value, exp);
};

helpers.floor10 = function(value, exp) {
  return helpers.decimalAdjust('floor', value, exp);
};

helpers.ceil10 = function(value, exp) {
  return helpers.decimalAdjust('ceil', value, exp);
};

////////////////////////////////////////////////////////////

// A weak Moneypot API abstraction
//
// Moneypot's API docs: https://www.moneypot.com/api-docs
var MoneyPot = (function() {

  var o = {};

  o.apiVersion = 'v1';

  // method: 'GET' | 'POST' | ...
  // endpoint: '/tokens/abcd-efgh-...'
  var noop = function() {};
  var makeMPRequest = function(method, bodyParams, endpoint, callbacks, overrideOpts) {

    if (!worldStore.state.accessToken)
      throw new Error('Must have accessToken set to call MoneyPot API');

    var url = config.mp_api_uri + '/' + o.apiVersion + endpoint;

    if (worldStore.state.accessToken) {
      url = url + '?access_token=' + worldStore.state.accessToken;
    }

    var ajaxOpts = {
      url:      url,
      dataType: 'json', // data type of response
      method:   method,
      data:     bodyParams ? JSON.stringify(bodyParams) : undefined,
      // By using text/plain, even though this is a JSON request,
      // we avoid preflight request. (Moneypot explicitly supports this)
      headers: {
        'Content-Type': 'text/plain'
      },
      // Callbacks
      success:  callbacks.success || noop,
      error:    callbacks.error || noop,
      complete: callbacks.complete || noop
    };

    $.ajax(_.merge({}, ajaxOpts, overrideOpts || {}));
  };

  o.listBets = function(callbacks) {
    var endpoint = '/list-bets';
    makeMPRequest('GET', undefined, endpoint, callbacks, {
      data: {
        app_id: config.app_id,
        limit: config.bet_buffer_size
      }
    });
  };

  o.getTokenInfo = function(callbacks) {
    var endpoint = '/token';
    makeMPRequest('GET', undefined, endpoint, callbacks);
  };

  o.generateBetHash = function(callbacks) {
    var endpoint = '/hashes';
    makeMPRequest('POST', undefined, endpoint, callbacks);
  };

  o.getDepositAddress = function(callbacks) {
    var endpoint = '/deposit-address';
    makeMPRequest('GET', undefined, endpoint, callbacks);
  };

  // gRecaptchaResponse is string response from google server
  // `callbacks.success` signature        is fn({ claim_id: Int, amoutn: Satoshis })
  o.claimFaucet = function(gRecaptchaResponse, callbacks) {
    console.log('Hitting POST /claim-faucet');
    var endpoint = '/claim-faucet';
    var body = { response: gRecaptchaResponse };
    makeMPRequest('POST', body, endpoint, callbacks);
  };

  // bodyParams is an object:
  // - wager: Int in satoshis
  // - client_seed: Int in range [0, 0^32)
  // - hash: BetHash
  // - cond: '<' | '>'
  // - number: Int in range [0, 99.99] that cond applies to
  // - payout: how many satoshis to pay out total on win (wager * multiplier)
  o.placeSimpleDiceBet = function(bodyParams, callbacks) {
    var endpoint = '/bets/simple-dice';
    makeMPRequest('POST', bodyParams, endpoint, callbacks);
  };
  o.tip = function(bodyParams, callbacks) {
        var endpoint = '/tip';
        makeMPRequest('POST', bodyParams, endpoint, callbacks);
};
  return o;
})();

////////////////////////////////////////////////////////////

var Dispatcher = new (function() {
  // Map of actionName -> [Callback]
  this.callbacks = {};

  var self = this;

  // Hook up a store's callback to receive dispatched actions from dispatcher
  //
  // Ex: Dispatcher.registerCallback('NEW_MESSAGE', function(message) {
  //       console.log('store received new message');
  //       self.state.messages.push(message);
  //       self.emitter.emit('change', self.state);
  //     });
  this.registerCallback = function(actionName, cb) {
    console.log('[Dispatcher] registering callback for:', actionName);

    if (!self.callbacks[actionName]) {
      self.callbacks[actionName] = [cb];
    } else {
      self.callbacks[actionName].push(cb);
    }
  };

  this.sendAction = function(actionName, payload) {
    console.log('[Dispatcher] received action:', actionName, payload);

    // Ensure this action has 1+ registered callbacks
    if (!self.callbacks[actionName]) {
      throw new Error('Unsupported actionName: ' + actionName);
    }

    // Dispatch payload to each registered callback for this action
    self.callbacks[actionName].forEach(function(cb) {
      cb(payload);
    });
  };
});

////////////////////////////////////////////////////////////

var Store = function(storeName, initState, initCallback) {

  this.state = initState;
  this.emitter = new EventEmitter();

  // Execute callback immediately once store (above state) is setup
  // This callback should be used by the store to register its callbacks
  // to the dispatcher upon initialization
  initCallback.call(this);

  var self = this;

  // Allow components to listen to store events (i.e. its 'change' event)
  this.on = function(eventName, cb) {
    self.emitter.on(eventName, cb);
  };

  this.off = function(eventName, cb) {
    self.emitter.off(eventName, cb);
  };
};

////////////////////////////////////////////////////////////

// Manage access_token //////////////////////////////////////
//
// - If access_token is in url, save it into localStorage.
//   `expires_in` (seconds until expiration) will also exist in url
//   so turn it into a date that we can compare

var access_token, expires_in, expires_at;

if (helpers.getHashParams().access_token) {
  console.log('[token manager] access_token in hash params');
  access_token = helpers.getHashParams().access_token;
  expires_in = helpers.getHashParams().expires_in;
  expires_at = new Date(Date.now() + (expires_in * 1000));

  localStorage.setItem('access_token', access_token);
  localStorage.setItem('expires_at', expires_at);
} else if (localStorage.access_token) {
  console.log('[token manager] access_token in localStorage');
  expires_at = localStorage.expires_at;
  // Only get access_token from localStorage if it expires
  // in a week or more. access_tokens are valid for two weeks
  if (expires_at && new Date(expires_at) > new Date(Date.now() + (1000 * 60 * 60 * 24 * 7))) {
    access_token = localStorage.access_token;
  } else {
    localStorage.removeItem('expires_at');
    localStorage.removeItem('access_token');
  }
} else {
  console.log('[token manager] no access token');
}

// Scrub fragment params from url.
if (window.history && window.history.replaceState) {
  window.history.replaceState({}, document.title, "/");
} else {
  // For browsers that don't support html5 history api, just do it the old
  // fashioned way that leaves a trailing '#' in the url
  window.location.hash = '#';
}

////////////////////////////////////////////////////////////

var chatStore = new Store('chat', {
  messages: new CBuffer(config.chat_buffer_size),
  waitingForServer: false,
  userList: {},
  showUserList: false,
  loadingInitialMessages: true
}, function() {
  var self = this;

  // `data` is object received from socket auth
  Dispatcher.registerCallback('INIT_CHAT', function(data) {
    console.log('[ChatStore] received INIT_CHAT');
    // Give each one unique id
    var messages = data.chat.messages.map(function(message) {
      message.id = genUuid();
      return message;
    });

    // Reset the CBuffer since this event may fire multiple times,
    // e.g. upon every reconnection to chat-server.
    self.state.messages.empty();

    self.state.messages.push.apply(self.state.messages, messages);

    // Indicate that we're done with initial fetch
    self.state.loadingInitialMessages = false;

    // Load userList
    self.state.userList = data.chat.userlist;
    self.emitter.emit('change', self.state);
    self.emitter.emit('init');
  });

  Dispatcher.registerCallback('NEW_MESSAGE', function(message) {
    console.log('[ChatStore] received NEW_MESSAGE');
    message.id = genUuid();
    self.state.messages.push(message);

    self.emitter.emit('change', self.state);
    self.emitter.emit('new_message');
  });

  Dispatcher.registerCallback('TOGGLE_CHAT_USERLIST', function() {
    console.log('[ChatStore] received TOGGLE_CHAT_USERLIST');
    self.state.showUserList = !self.state.showUserList;
    self.emitter.emit('change', self.state);
  });

  // user is { id: Int, uname: String, role: 'admin' | 'mod' | 'owner' | 'member' }
  Dispatcher.registerCallback('USER_JOINED', function(user) {
    console.log('[ChatStore] received USER_JOINED:', user);
    self.state.userList[user.uname] = user;
    self.emitter.emit('change', self.state);
  });

  // user is { id: Int, uname: String, role: 'admin' | 'mod' | 'owner' | 'member' }
  Dispatcher.registerCallback('USER_LEFT', function(user) {
    console.log('[ChatStore] received USER_LEFT:', user);
    delete self.state.userList[user.uname];
    self.emitter.emit('change', self.state);
  });

  // Message is { text: String }
  Dispatcher.registerCallback('SEND_MESSAGE', function(text) {
          if (text.substring(0, 4) == "/tip") {
                  // TIP CODE HERE
                var tipres = text.split(" ");
                var tipamount = Math.round(parseFloat(tipres[2]) * 1e8);
                var tipto = tipres[1];
                // send tip to moneypot


        var params = {
        uname: tipto,
        amount: tipamount
      };

          MoneyPot.tip(params, {
                  success: function(tip) {
                  Dispatcher.sendAction('UPDATE_USER', {
            balance: worldStore.state.user.balance - tipamount
          });
                   alert("Successfully sent "+tipres[2]+"BTC to "+tipto); console.log('Successfully made tip.');
                  },
                  error: function(xhr) {
                    console.log('Error' + tipto + '|' + tipamount + '');
                    if (xhr.responseJSON && xhr.responseJSON) {
                      alert(xhr.responseJSON.error);
                    } else {
                      alert('Internal Error');
                    }
                  }

                  })




          } else {
    console.log('[ChatStore] received SEND_MESSAGE');
    self.state.waitingForServer = true;
    self.emitter.emit('change', self.state);
    socket.emit('new_message', { text: text }, function(err) {
      if (err) {
        alert('Chat Error: ' + err);
      }
    });
        }
  });
});

var betStore = new Store('bet', {
  nextHash: undefined,
  wager: {
    str: '0.00000100',
    num: 0.00000100,
    error: undefined
  },
  multiplier: {
    str: '2.00',
    num: 2.00,
    error: undefined
  },
  hotkeysEnabled: false,
  automaticWager: {
      str: '0.00000100',
      num: 0.00000100,
      error: undefined
  },
  automaticMultiplierWager: {
      str: '1.00',
      num: 1.00,
      error: undefined
  },
  multiOnLose: {
    str: '2',
    error: undefined
  },
  clientSeed: {
    str: '25151115',
    num: 25151115,
    error:void 0
  },
  showAutomaticRoll: false,
  automaticToggle: false,
  increaseOnWin: true,
  increaseOnLose: true,
  multiOnWin: 0,
  betCounter: 1,
  stopMaxBalance: '',
  stopMinBalance: '',
  checkBoxNumberOfBet: 'false',
  checkSpeedOfBet : 'false',
  disableNumberOfBet: false,
  NumberOfBetLimit:{
    str: '',
    num: 0,
    error: undefined
  },
  profitGained:{
    str: '',
    num: 1,
    error: undefined
  },
  betVelocity: 1
}, function() {
  var self = this;

  Dispatcher.registerCallback('SET_NEXT_HASH', function(hexString) {
    self.state.nextHash = hexString;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('UPDATE_WAGER', function(newWager) {
    self.state.wager = _.merge({}, self.state.wager, newWager);

    //var n = parseInt(self.state.wager.str, 10);
        //var n = parseInt("1.3", 10);
        var n = self.state.wager.str;

    // If n is a number, ensure it's at least 1 bit
    //if (isFinite(n)) {
      //n = Math.max(n, 1);
      self.state.wager.str = n.toString();
    //}


    // Ensure wagerString is a number
    //if (isNaN(n) || /[^\d]/.test(n.toString())) {
        if (n < 0.00000100) {
      self.state.wager.error = 'INVALID_WAGER';
    // Ensure user can afford balance
    } else if (n / 0.00000001 > worldStore.state.user.balance) {
      self.state.wager.error = 'CANNOT_AFFORD_WAGER';
      self.state.wager.num = n;
    } else {
      // wagerString is valid
      if (n > 7){
        self.state.wager.error = 'CANNOT_AFFORD_WAGER';
        self.state.wager.num = n;
      } else {
            self.state.wager.error = null;
            self.state.wager.str = n.toString();
            self.state.wager.num = n;
        if (!betStore.state.automaticToggle) {
          self.state.profitGained.num = self.state.wager.num;
        }
      }
    }
        if (isNumeric(n) && (n < 0.00000100)){
                self.state.wager.error = 'INVALID_WAGER';
        } else {
            self.state.wager.error = null; // z
            self.state.wager.str = n.toString(); // z
            self.state.wager.num = n; // z
        }

    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback("UPDATE_CLIENT_SEED",function(t){
    var n = parseInt(t ,10);
    isNaN(n)||/[^\d]/.test(n.toString())?
    self.state.clientSeed.error = "NOT_INTEGER":0>n?
    self.state.clientSeed.error = "TOO_LOW":
    n > Math.pow(2, 32) - 1?
    self.state.clientSeed.error = "TOO_HIGH":(
    self.state.clientSeed.error = void 0,
    self.state.clientSeed.str = n.toString(),
    self.state.clientSeed.num = n),
    self.emitter.emit("change", self.state)
  });

  Dispatcher.registerCallback('TOGGLE_CHAT', function() {
    self.state.chatEnabled = !self.state.chatEnabled;
    self.emitter.emit('change', self.state);
    document.getElementById('betBoxBox').classList.toggle("translateR");
    document.getElementById('chat-box').classList.toggle("chatHide");
    document.getElementById('chat-box').classList.toggle("chatShow");
  });
  
  
  Dispatcher.registerCallback('UPDATE_AUTOMATIC_WAGER', function(newWager) {
        self.state.automaticWager = _.merge({}, self.state.automaticWager, newWager);

        //var n = parseInt(self.state.automaticWager.str, 10);
                var n = self.state.automaticWager.str;

        // If n is a number, ensure it's at least 1 bit
        //if (isFinite(n)) {
          //n = Math.max(n, 1);
          self.state.automaticWager.str = n.toString();
        //}

        // Ensure wagerString is a number
        //if (isNaN(n) || /[^\d]/.test(n.toString())) {
                if (n < 1) {
          self.state.automaticWager.error = 'INVALID_WAGER';
        // Ensure user can afford balance
        } else if (n / 0.00000001 > worldStore.state.user.balance) {
          self.state.automaticWager.error = 'CANNOT_AFFORD_WAGER';
          self.state.automaticWager.num = n;
        } else {
          // wagerString is valid
          self.state.automaticWager.error = null;
          self.state.automaticWager.str = n.toString();
          self.state.automaticWager.num = n;
        }
          self.state.automaticWager.error = null;
          self.state.automaticWager.str = n.toString();
          self.state.automaticWager.num = n;

        self.emitter.emit('change', self.state);
    });

    Dispatcher.registerCallback('AUTOMATIC_BET_WAGER_STATE', function() {
        console.log('[BetStore] received AUTOMATIC_BET_WAGER_STATE');
        betStore.state.automaticToggle = !betStore.state.automaticToggle;
        self.emitter.emit('change', self.state);
    });

    Dispatcher.registerCallback('AUTOMATE_TOGGLE_ROLL', function() {
        console.log('[BetStore] received AUTOMATE_TOGGLE_ROLL');
        betStore.state.automaticToggle = true;
        var balance = worldStore.state.user.balance * 0.00000001;
        var stop = false;
        if(betStore.state.checkBoxNumberOfBet === 'true' && (betStore.state.betCounter + 1) == self.state.NumberOfBetLimit.str){
            stop = true;
        }
        if (!isNaN(parseInt(betStore.state.stopMinBalance))) {
            if (betStore.state.stopMinBalance >= balance) {
              stop = true;
            }
        }
        if (!isNaN(parseInt(betStore.state.stopMaxBalance))) {
            if (betStore.state.stopMaxBalance <= balance) {
              stop = true;
            }
        }
        if (stop) {
          Dispatcher.sendAction("STOP_ROLL");
          setTimeout(console.log('delayed'), 1000);
        }else {
            betStore.state.betCounter++;
        }
        self.emitter.emit('change', self.state);
    });

    Dispatcher.registerCallback('TOGGLE_SHOW_AUTOMATIC_ROLL', function() {
        console.log('[BetStore] received TOGGLE_SHOW_AUTOMATIC_ROLL');
        betStore.state.showAutomaticRoll = !betStore.state.showAutomaticRoll;
        betStore.state.increaseOnWin = true;
        betStore.state.increaseOnLose = true;
        betStore.state.checkBoxNumberOfBet = false;
        self.emitter.emit('change', self.state);
    });

    Dispatcher.registerCallback("SET_AUTOMATIC_NUMBER_OF_BETS", function(stateNumberOfBet){
        betStore.state.checkBoxNumberOfBet = stateNumberOfBet;
        if(betStore.state.checkBoxNumberOfBet === 'true'){
            betStore.state.disableNumberOfBet = false;
        }else{
            betStore.state.disableNumberOfBet = true;
        }
        self.emitter.emit('change', self.state);
    });


    Dispatcher.registerCallback("AUGMENT_PROFIT", function(multi){
        var profitQuantity = betStore.state.profitGained.num * Number(multi);
        var balanceQuantity = worldStore.state.user.balance * 0.00000001;
        if(balanceQuantity > profitQuantity){
            betStore.state.profitGained.num = profitQuantity;
            //betStore.state.profitGained.num = Number(betStore.state.profitGained.num.toFixed(0));
                        betStore.state.profitGained.num = Number(betStore.state.profitGained.num);
        }else{
            Dispatcher.sendAction("STOP_ROLL");
        }
        self.emitter.emit('change', self.state);
    });
    Dispatcher.registerCallback("RETURN_BASE_BET", function(){
        betStore.state.profitGained.num = betStore.state.wager.num;
    });
    Dispatcher.registerCallback("SET_MULTI_ON_WIN", function(multiOnWin){
        var n = parseInt(multiOnWin, 10);
        if (isNaN(n) || /[^\d]/.test(n.toString())) {
          betStore.state.multiOnWin = '';
          self.state.multiOnLose.error = 'INVALID_AUTO_MULTIPLIER';
        }else {
          self.state.multiOnLose.error = null;
          betStore.state.multiOnWin = n;
        }
        self.emitter.emit('change', self.state);
    });
    Dispatcher.registerCallback("SET_MULTI_ON_LOSE", function(multiOnLose){
        //var n = parseInt(multiOnLose, 10);
                var n = multiOnLose;
        if (isNaN(n) || /[^\d]/.test(n.toString())) {
          betStore.state.multiOnLose.str = '';
          betStore.state.multiOnLose.error = 'INVALID_AUTO_MULTIPLIER';
        }else {
          betStore.state.multiOnLose.error = null;
          betStore.state.multiOnLose.str = n;
        }
          betStore.state.multiOnLose.error = null;
          betStore.state.multiOnLose.str = n;
        self.emitter.emit('change', self.state);
    });
    Dispatcher.registerCallback("SET_STOP_MAX_BALANCE", function(stopMaxBalance){
      //var n = parseInt(stopMaxBalance, 10);
                      var n = stopMaxBalance;
      if (isNaN(n) || /[^\d]/.test(n.toString())) {
        betStore.state.stopMaxBalance = '';
      }else {
              betStore.state.stopMaxBalance.error = null;
        betStore.state.stopMaxBalance = n;
      }
      betStore.state.stopMaxBalance.error = null;
      betStore.state.stopMaxBalance = n;
    self.emitter.emit('change', self.state);
    });
    Dispatcher.registerCallback("SET_STOP_MIN_BALANCE", function(stopMinBalance){
      //var n = parseInt(stopMinBalance, 10);
                      var n = stopMinBalance;
      if (isNaN(n) || /[^\d]/.test(n.toString())) {
        betStore.state.stopMinBalance = '';
      }else {
              betStore.state.stopMinBalance.error = null;
        betStore.state.stopMinBalance = n;
      }
      betStore.state.stopMinBalance.error = null;
      betStore.state.stopMinBalance = n;
    self.emitter.emit('change', self.state);
    });

    Dispatcher.registerCallback("STOP_ROLL", function(){
        betStore.state.automaticToggle = false;
        betStore.state.betCounter = 1;
        betStore.state.profitGained.num = betStore.state.wager.num;
        self.emitter.emit('change', self.state);
    });
    Dispatcher.registerCallback("RETURN_BASE_BET", function(){
        betStore.state.profitGained.num = betStore.state.wager.num;
    });

    Dispatcher.registerCallback('UPDATE_NUMBER_OF_BETS_LIMIT', function(limit) {
        self.state.NumberOfBetLimit = _.merge({}, self.state.automaticMultiplierWager, limit);
        self.emitter.emit('change', self.state);
    });

  Dispatcher.registerCallback('UPDATE_MULTIPLIER', function(newMult) {
    self.state.multiplier = _.merge({}, self.state.multiplier, newMult);
    self.emitter.emit('change', self.state);
  });
});

// The general store that holds all things until they are separated
// into smaller stores for performance.
var worldStore = new Store('world', {
  isLoading: true,
  user: undefined,
  accessToken: access_token,
  isRefreshingUser: false,
  hotkeysEnabled: false,
  chatEnabled:true,
  currTab: 'ALL_BETS',
  // TODO: Turn this into myBets or something
  bets: new CBuffer(config.bet_buffer_size),
  // TODO: Fetch list on load alongside socket subscription
  allBets: new CBuffer(config.bet_buffer_size),
  grecaptcha: undefined
}, function() {
  var self = this;

  // TODO: Consider making these emit events unique to each callback
  // for more granular reaction.

  // data is object, note, assumes user is already an object
  Dispatcher.registerCallback('UPDATE_USER', function(data) {
    self.state.user = _.merge({}, self.state.user, data);
    self.emitter.emit('change', self.state);
  });

  // deprecate in favor of SET_USER
  Dispatcher.registerCallback('USER_LOGIN', function(user) {
    self.state.user = user;
    self.emitter.emit('change', self.state);
    self.emitter.emit('user_update');
  });

  // Replace with CLEAR_USER
  Dispatcher.registerCallback('USER_LOGOUT', function() {
    self.state.user = undefined;
    self.state.accessToken = undefined;
    localStorage.removeItem('expires_at');
    localStorage.removeItem('access_token');
    self.state.bets.empty();
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('START_LOADING', function() {
    self.state.isLoading = true;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('STOP_LOADING', function() {
    self.state.isLoading = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('CHANGE_TAB', function(tabName) {
    console.assert(typeof tabName === 'string');
    self.state.currTab = tabName;
    self.emitter.emit('change', self.state);
  });

  // This is only for my bets? Then change to 'NEW_MY_BET'
  Dispatcher.registerCallback('NEW_BET', function(bet) {
    console.assert(typeof bet === 'object');
    self.state.bets.push(bet);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('NEW_ALL_BET', function(bet) {
    self.state.allBets.push(bet);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('INIT_ALL_BETS', function(bets) {
    console.assert(_.isArray(bets));
    self.state.allBets.push.apply(self.state.allBets, bets);
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('TOGGLE_HOTKEYS', function() {
    self.state.hotkeysEnabled = !self.state.hotkeysEnabled;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('DISABLE_HOTKEYS', function() {
    self.state.hotkeysEnabled = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('START_REFRESHING_USER', function() {
    self.state.isRefreshingUser = true;
    self.emitter.emit('change', self.state);
    MoneyPot.getTokenInfo({
      success: function(data) {
        console.log('Successfully loaded user from tokens endpoint', data);
        var user = data.auth.user;
        self.state.user = user;
        self.emitter.emit('change', self.state);
        self.emitter.emit('user_update');
      },
      error: function(err) {
        console.log('Error:', err);
      },
      complete: function() {
        Dispatcher.sendAction('STOP_REFRESHING_USER');
      }
    });
  });

  Dispatcher.registerCallback('STOP_REFRESHING_USER', function() {
    self.state.isRefreshingUser = false;
    self.emitter.emit('change', self.state);
  });

  Dispatcher.registerCallback('GRECAPTCHA_LOADED', function(_grecaptcha) {
    self.state.grecaptcha = _grecaptcha;
    self.emitter.emit('grecaptcha_loaded');
  });

});

////////////////////////////////////////////////////////////


////////////////////////////////////////////////////////////

var UserBox = React.createClass({
  displayName: 'UserBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
    betStore.on('change', this._onStoreChange);
  },
  componentWillUnount: function() {
    worldStore.off('change', this._onStoreChange);
    betStore.off('change', this._onStoreChange);
  },
  _onLogout: function() {
    Dispatcher.sendAction('USER_LOGOUT');
  },
  _onRefreshUser: function() {
    Dispatcher.sendAction('START_REFRESHING_USER');
  },
  _openWithdrawPopup: function() {
    var windowUrl = config.mp_browser_uri + '/dialog/withdraw?app_id=' + config.app_id;
    var windowName = 'manage-auth';
    var windowOpts = [
      'width=420',
      'height=350',
      'left=100',
      'top=100'
    ].join(',');
    var windowRef = window.open(windowUrl, windowName, windowOpts);
    windowRef.focus();
    return false;
  },
  _openDepositPopup: function() {
    var windowUrl = config.mp_browser_uri + '/dialog/deposit?app_id=' + config.app_id;
    var windowName = 'manage-auth';
    var windowOpts = [
      'width=420',
      'height=550',
      'left=100',
      'top=100'
    ].join(',');
    var windowRef = window.open(windowUrl, windowName, windowOpts);
    windowRef.focus();
    return false;
  },
  render: function() {

    var innerNode;
    if (worldStore.state.isLoading) {
      innerNode = el.p(
        {className: 'navbar-text'},
        'Loading...'
      );
    } else if (worldStore.state.user) {
      innerNode = el.div(
        null,
        // Deposit/Withdraw popup buttons
        el.div(
          {className: 'btn-group navbar-left btn-group-xs'},
          el.button(
            {
              type: 'button',
              className: 'btn navbar-btn btn-xs ' + (betStore.state.wager.error === 'CANNOT_AFFORD_WAGER' ? 'btn-success' : 'btn-default'),
              onClick: this._openDepositPopup
            },
            'Deposit'
          ),
          el.button(
            {
              type: 'button',
              className: 'btn btn-default navbar-btn btn-xs',
              onClick: this._openWithdrawPopup
            },
            'Withdraw'
          )
        ),
        // Balance
        el.span(
          {
            className: 'navbar-text',
            style: {marginRight: '5px'}
          },
          (worldStore.state.user.balance * 0.00000001) + ' BTC',
          !worldStore.state.user.unconfirmed_balance ?
           '' :
           el.span(
             {style: { color: '#e67e22'}},
             ' + ' + (worldStore.state.user.unconfirmed_balance * 0.00000001) + ' BTC pending'
           )
        ),
        // Refresh button
        el.button(
          {
            className: 'btn btn-link navbar-btn navbar-left ' + (worldStore.state.isRefreshingUser ? ' rotate' : ''),
            title: 'Refresh Balance',
            disabled: worldStore.state.isRefreshingUser,
            onClick: this._onRefreshUser,
            style: {
              paddingLeft: 0,
              paddingRight: 0,
              marginRight: '10px'
            }
          },
          el.span({className: 'glyphicon glyphicon-refresh'})
        ),
        // Logged in as...
        el.span(
          {className: 'navbar-text'},
          'Logged in as ',
          el.code(null, worldStore.state.user.uname)
        ),
        // Logout button
        el.button(
          {
            type: 'button',
            onClick: this._onLogout,
            className: 'navbar-btn btn btn-default'
          },
          'Logout'
        )
      );
    } else {
      // User needs to login
      innerNode = el.p(
        {className: 'navbar-text'},
        el.a(
          {
            href: config.mp_browser_uri + '/oauth/authorize' +
              '?app_id=' + config.app_id +
              '&redirect_uri=' + config.redirect_uri,
            className: 'btn btn-default'
          },
          'Login with Moneypot'
        )
      );
    }

    return el.div(
      {className: 'navbar-right'},
      innerNode
    );
  }
});

var Navbar = React.createClass({
  displayName: 'Navbar',
  render: function() {
    return el.div(
      {className: 'navbar'},
      el.div(
        {className: 'container-fluid'},
        el.div(
          {className: 'navbar-header'},
          el.a({className: 'navbar-brand', href:'/'}, config.app_name)
        ),
        // Links
        el.ul(
          {className: 'nav navbar-nav'},
          el.li(
            null,
            el.a(
              {
                href: config.mp_browser_uri + '/apps/' + config.app_id,
                target: '_blank'
              },
              'View on Moneypot ',
              // External site glyphicon
              el.span(
                {className: 'glyphicon glyphicon-new-window'}
              )
            )
          )
        ),
        // Userbox
        React.createElement(UserBox, null)
      )
    );
  }
});

var ChatBoxInput = React.createClass({
  displayName: 'ChatBoxInput',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    chatStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    chatStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  getInitialState: function() {
    return { text: '' };
  },
  // Whenever input changes
  _onChange: function(e) {
    this.setState({ text: e.target.value });
  },
  // When input contents are submitted to chat server
  _onSend: function() {
    var self = this;
    Dispatcher.sendAction('SEND_MESSAGE', this.state.text);
    this.setState({ text: '' });
  },
  _onFocus: function() {
    // When users click the chat input, turn off bet hotkeys so they
    // don't accidentally bet
    if (worldStore.state.hotkeysEnabled) {
      Dispatcher.sendAction('DISABLE_HOTKEYS');
    }
  },
  _onKeyPress: function(e) {
    var ENTER = 13;
    if (e.which === ENTER) {
      if (this.state.text.trim().length > 0) {
        this._onSend();
      }
    }
  },
  render: function() {
    return (
      el.div(
        {className: 'row'},
        el.div(
          {className: 'col-md-9'},
          chatStore.state.loadingInitialMessages ?
            el.div(
              {
                style: {marginTop: '7px'},
                className: 'text-muted'
              },
              el.span(
                {className: 'glyphicon glyphicon-refresh rotate'}
              ),
              ' Loading...'
            )
          :
            el.input(
              {
                id: 'chat-input',
                className: 'form-control',
                type: 'text',
                value: this.state.text,
                placeholder: worldStore.state.user ?
                  'Click here and begin typing...' :
                  'Login to chat',
                onChange: this._onChange,
                onKeyPress: this._onKeyPress,
                onFocus: this._onFocus,
                ref: 'input',
                // TODO: disable while fetching messages
                disabled: !worldStore.state.user || chatStore.state.loadingInitialMessages
              }
            )
        ),
        el.div(
          {className: 'col-md-3'},
          el.button(
            {
              type: 'button',
              className: 'btn btn-default btn-block',
              disabled: !worldStore.state.user ||
                chatStore.state.waitingForServer ||
                this.state.text.trim().length === 0,
              onClick: this._onSend
            },
            'Send'
          )
        )
      )
    );
  }
});

var ChatUserList = React.createClass({
  displayName: 'ChatUserList',
  render: function() {
    return (
      el.div(
        {className: 'panel panel-default'},
        el.div(
          {className: 'panel-heading'},
          'UserList'
        ),
        el.div(
          {className: 'panel-body'},
          el.ul(
            {},
            _.values(chatStore.state.userList).map(function(u) {
              return el.li(
                {
                  key: u.uname
                },
                helpers.roleToLabelElement(u.role, u.uname),
                ' ' + u.uname
              );
            })
          )
        )
      )
    );
  }
});

var ChatBox = React.createClass({
  displayName: 'ChatBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  // New messages should only force scroll if user is scrolled near the bottom
  // already. This allows users to scroll back to earlier convo without being
  // forced to scroll to bottom when new messages arrive
  _onNewMessage: function() {
    var node = this.refs.chatListRef.getDOMNode();

    // Only scroll if user is within 100 pixels of last message
    var shouldScroll = function() {
      var distanceFromBottom = node.scrollHeight - ($(node).scrollTop() + $(node).innerHeight());
      console.log('DistanceFromBottom:', distanceFromBottom);
      return distanceFromBottom <= 100;
    };

    if (shouldScroll()) {
      this._scrollChat();
    }
  },
  _scrollChat: function() {
    var node = this.refs.chatListRef.getDOMNode();
    $(node).scrollTop(node.scrollHeight);
  },
  componentDidMount: function() {
    chatStore.on('change', this._onStoreChange);
    chatStore.on('new_message', this._onNewMessage);
    chatStore.on('init', this._scrollChat);
  },
  componentWillUnmount: function() {
    chatStore.off('change', this._onStoreChange);
    chatStore.off('new_message', this._onNewMessage);
    chatStore.off('init', this._scrollChat);
  },
  //
  _onUserListToggle: function() {
    Dispatcher.sendAction('TOGGLE_CHAT_USERLIST');
  },
  render: function() {
    return el.div(
      {id: 'chat-box',className:"chatShow"},
      el.div(
        {className: 'panel'},
        el.div(
          {className: 'panel-body'},
          el.ul(
            {className: 'chat-list list-unstyled', ref: 'chatListRef'},
            chatStore.state.messages.toArray().map(function(m) {
              return el.li(
                {
                  // Use message id as unique key
                  key: m.id
                },
                el.span(
                  {
                    style: {
                      fontFamily: 'monospace'
                    }
                  },
                  helpers.formatDateToTime(m.created_at),
                  ' '
                ),
                m.user ? helpers.roleToLabelElement(m.user.role) : '',
                m.user ? ' ' : '',
                el.code(
                  null,
                  m.user ?
                    // If chat message:
                    m.user.uname :
                    // If system message:
                    'SYSTEM :: ' + m.text
                ),
                m.user ?
                  // If chat message
                  el.span(null,el.span(null, ' ' + m.text)) :
                  // If system message
                  ''
              );
            })
          )
        ),
        el.div(
          {className: 'panel-footer'},
          React.createElement(ChatBoxInput, null)
        )
      ),
      // After the chatbox panel
      el.p(
        {
          className: 'text-right text-muted',
          style: { marginTop: '-15px' }
        },
        'Users online: ' + Object.keys(chatStore.state.userList).length + ' ',
        // Show/Hide userlist button
        el.button(
          {
            className: 'btn btn-default btn-xs',
            onClick: this._onUserListToggle
          },
          chatStore.state.showUserList ? 'Hide' : 'Show'
        )
      ),
      // Show userlist
      chatStore.state.showUserList ? React.createElement(ChatUserList, null) : ''
    );
  }
});

var BetBoxChance = React.createClass({
  displayName: 'BetBoxChance',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  render: function() {
    // 0.00 to 1.00
    var winProb = helpers.multiplierToWinProb(betStore.state.multiplier.num);

    var isError = betStore.state.multiplier.error || betStore.state.wager.error;

    // Just show '--' if chance can't be calculated
    var innerNode;
    if (isError) {
      innerNode = el.span(
        {className: 'lead'},
        ' --'
      );
    } else {
      innerNode = el.span(
        {className: 'lead'},
        ' ' + (winProb * 100).toFixed(2).toString() + '%'
      );
    }

    return el.div(
      {},
      el.span(
        {className: 'lead', style: { fontWeight: 'bold' }},
        'Chance:'
      ),
      innerNode
    );
  }
});

var BetBoxProfit = React.createClass({
  displayName: 'BetBoxProfit',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  render: function() {
    var profit = betStore.state.wager.num * (betStore.state.multiplier.num - 1);

    var innerNode;
    if (betStore.state.multiplier.error || betStore.state.wager.error) {
      innerNode = el.span(
        {className: 'lead'},
        '--'
      );
    } else {
      innerNode = el.span(
        {
          className: 'lead',
          style: { color: '#39b54a' }
        },
        '+' + profit.toFixed(8)
      );
    }

    return el.div(
      null,
      el.span(
        {className: 'lead', style: { fontWeight: 'bold' }},
        'Profit: '
      ),
      innerNode
    );
  }
});

var BetBoxMultiplier = React.createClass({
  displayName: 'BetBoxMultiplier',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
  },
  //
  _validateMultiplier: function(newStr) {
    var num = parseFloat(newStr, 10);

    // If num is a number, ensure it's at least 0.01x
    // if (Number.isFinite(num)) {
    //   num = Math.max(num, 0.01);
    //   this.props.currBet.setIn(['multiplier', 'str'], num.toString());
    // }

    var isFloatRegexp = /^(\d*\.)?\d+$/;

    // Ensure str is a number
    if (isNaN(num) || !isFloatRegexp.test(newStr)) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'INVALID_MULTIPLIER' });
      // Ensure multiplier is >= 1.00x
    } else if (num < 1.01) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_LOW' });
      // Ensure multiplier is <= max allowed multiplier (100x for now)
    } else if (num > 9900) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_HIGH' });
      // Ensure no more than 2 decimal places of precision
    } else if (helpers.getPrecision(num) > 2) {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', { error: 'MULTIPLIER_TOO_PRECISE' });
      // multiplier str is valid
    } else {
      Dispatcher.sendAction('UPDATE_MULTIPLIER', {
        num: num,
        error: null
      });
    }
  },
  _onMultiplierChange: function(e) {
    console.log('Multiplier changed');
    var str = e.target.value;
    console.log('You entered', str, 'as your multiplier');
    Dispatcher.sendAction('UPDATE_MULTIPLIER', { str: str });
    this._validateMultiplier(str);
  },
  render: function() {
    return el.div(
      {className: 'form-group'},
      el.p(
        {className: 'lead'},
        el.strong(
          {
            style: betStore.state.multiplier.error ? { color: 'red' } : {}
          },
          'Multiplier:')
      ),
      el.div(
        {className: 'input-group'},
        el.input(
          {
            type: 'text',
            value: betStore.state.multiplier.str,
            className: 'form-control input-lg',
            onChange: this._onMultiplierChange,
            disabled: !!worldStore.state.isLoading
          }
        ),
        el.span(
          {className: 'input-group-addon'},
          'x'
        )
      )
    );
  }
});

var BetBoxWager = React.createClass({
  displayName: 'BetBoxWager',
  // Hookup to stores
  _onStoreChange: function() {
    this.forceUpdate();
  },
  _onBalanceChange: function() {
    // Force validation when user logs in
    // TODO: Re-force it when user refreshes
    Dispatcher.sendAction('UPDATE_WAGER', {});
  },
  componentDidMount: function() {
    betStore.on('change', this._onStoreChange);
    worldStore.on('change', this._onStoreChange);
    worldStore.on('user_update', this._onBalanceChange);
  },
  componentWillUnmount: function() {
    betStore.off('change', this._onStoreChange);
    worldStore.off('change', this._onStoreChange);
    worldStore.off('user_update', this._onBalanceChange);
  },
  _onWagerChange: function(e) {
    var str = e.target.value;
    Dispatcher.sendAction('UPDATE_WAGER', { str: str });
  },
  _onHalveWager: function() {
    //var newWager = Math.round(betStore.state.wager.num / 2);
        if (betStore.state.wager.num != 0){
                var newWager = (betStore.state.wager.num / 2);
        }
    Dispatcher.sendAction('UPDATE_WAGER', { str: newWager.toString() });
  },
  _onDoubleWager: function() {
    var n = betStore.state.wager.num * 2;
    Dispatcher.sendAction('UPDATE_WAGER', { str: n.toString() });
  },
  _onMaxWager: function() {
    // If user is logged in, use their balance as max wager
    var balanceBits;
    if (worldStore.state.user) {
      balanceBits = worldStore.state.user.balance * .00000001;
      balanceBits = Math.floor(balanceBits * 1000000) / 1000000;
    } else {
      balanceBits = 42000;
    }
    Dispatcher.sendAction('UPDATE_WAGER', { str: balanceBits.toString() });
  },
  //
  render: function() {
    var style1 = { borderBottomLeftRadius: '0', borderBottomRightRadius: '0' };
    var style2 = { borderTopLeftRadius: '0' };
    var style3 = { borderTopRightRadius: '0' };
    return el.div(
      {className: 'form-group'},
      el.p(
        {className: 'lead'},
        el.strong(
          // If wagerError, make the label red
          betStore.state.wager.error ? { style: {color: 'red'} } : null,
          'Wager:')
      ),
      el.input(
        {
          value: betStore.state.wager.str,
          type: 'text',
          className: 'form-control input-lg',
          style: style1,
          onChange: this._onWagerChange,
          disabled: !!worldStore.state.isLoading,
          placeholder: 'BTC'
        }
      ),
      el.div(
        {className: 'btn-group btn-group-justified'},
        el.div(
          {className: 'btn-group'},
          el.button(
            {
              className: 'btn btn-default btn-md',
              type: 'button',
              style: style2,
              onClick: this._onHalveWager
            },
            '1/2x ', worldStore.state.hotkeysEnabled ? el.kbd(null, 'X') : ''
          )
        ),
        el.div(
          {className: 'btn-group'},
          el.button(
            {
              className: 'btn btn-default btn-md',
              type: 'button',
              onClick: this._onDoubleWager
            },
            '2x ', worldStore.state.hotkeysEnabled ? el.kbd(null, 'C') : ''
          )
        ),
        el.div(
          {className: 'btn-group'},
          el.button(
            {
              className: 'btn btn-default btn-md',
              type: 'button',
              style: style3,
              onClick: this._onMaxWager
            },
            'Max'
          )
        )
      )
    );
  }
});

var BetBoxButton = React.createClass({
  displayName: 'BetBoxButton',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
    betStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
    betStore.off('change', this._onStoreChange);
  },
  getInitialState: function() {
    return { waitingForServer: false };
  },
  // cond is '>' or '<'
  _makeBetHandler: function(cond) {
    var self = this;

    console.assert(cond === '<' || cond === '>');

    return function(e) {
      console.log('Placing bet...');

      // Indicate that we are waiting for server response
      self.setState({ waitingForServer: true });

      var hash = betStore.state.nextHash;
      console.assert(typeof hash === 'string');

      var wagerSatoshis = betStore.state.wager.num / 0.00000001;
      var multiplier = betStore.state.multiplier.num;
      var payoutSatoshis = wagerSatoshis * multiplier;

      var number = helpers.calcNumber(
        cond, helpers.multiplierToWinProb(multiplier)
      );

      var params = {
        wager: wagerSatoshis,
        client_seed: betStore.state.clientSeed.num,
        hash: hash,
        cond: cond,
        target: number,
        payout: payoutSatoshis
      };

      MoneyPot.placeSimpleDiceBet(params, {
        success: function(bet) {
          console.log('Successfully placed bet:', bet);
          // Append to bet list

          // We don't get this info from the API, so assoc it for our use
          bet.meta = {
            cond: cond,
            number: number,
            hash: hash,
            isFair: CryptoJS.SHA256(bet.secret + '|' + bet.salt).toString() === hash
          };

          // Sync up with the bets we get from socket
          bet.wager = wagerSatoshis;
          bet.uname = worldStore.state.user.uname;

          Dispatcher.sendAction('NEW_BET', bet);

          // Update next bet hash
          Dispatcher.sendAction('SET_NEXT_HASH', bet.next_hash);

          // Update user balance
          Dispatcher.sendAction('UPDATE_USER', {
            balance: worldStore.state.user.balance + bet.profit
          });
        },
        error: function(xhr) {
          console.log('Error');
          if (xhr.responseJSON && xhr.responseJSON) {
            alert(xhr.responseJSON.error);
          } else {
             alert('Internal Error');
          }
        },
        complete: function() {
          self.setState({ waitingForServer: false });
          // Force re-validation of wager
          Dispatcher.sendAction('UPDATE_WAGER', {
            str: betStore.state.wager.str
          });
        }
      });
    };
  },
  render: function() {
    var innerNode;

    // TODO: Create error prop for each input
    var error = betStore.state.wager.error || betStore.state.multiplier.error || betStore.state.clientSeed.error;

    if (worldStore.state.isLoading) {
      // If app is loading, then just disable button until state change
      innerNode = el.button(
        {type: 'button', disabled: true, className: 'btn btn-lg btn-block btn-default'},
        'Loading...'
      );
    } else if (error) {
      // If there's a betbox error, then render button in error state

      var errorTranslations = {
        'CANNOT_AFFORD_WAGER': 'You cannot afford wager',
        'INVALID_WAGER': 'Invalid wager',
        'INVALID_MULTIPLIER': 'Invalid multiplier',
        'MULTIPLIER_TOO_PRECISE': 'Multiplier too precise',
        'MULTIPLIER_TOO_HIGH': 'Multiplier too high',
        'MULTIPLIER_TOO_LOW': 'Multiplier too low'
      };

      innerNode = el.button(
        {type: 'button',
         disabled: true,
         className: 'btn btn-lg btn-block btn-danger'},
        errorTranslations[error] || 'Invalid bet'
      );
    } else if (worldStore.state.user) {
      // If user is logged in, let them submit bet
      innerNode =
        el.div(
          {className: 'row'},
          // bet hi
          el.div(
            {className: 'col-xs-6'},
            el.button(
              {
                id: 'bet-hi',
                type: 'button',
                className: 'btn btn-lg btn-primary btn-block',
                onClick: this._makeBetHandler('>'),
                disabled: !!this.state.waitingForServer
              },
              'Bet Hi ', worldStore.state.hotkeysEnabled ? el.kbd(null, 'H') : ''
            )
          ),
          // bet lo
          el.div(
            {className: 'col-xs-6'},
            el.button(
              {
                id: 'bet-lo',
                type: 'button',
                className: 'btn btn-lg btn-primary btn-block',
                onClick: this._makeBetHandler('<'),
                disabled: !!this.state.waitingForServer
              },
              'Bet Lo ', worldStore.state.hotkeysEnabled ? el.kbd(null, 'L') : ''
            )
          )
        );
    } else {
      // If user isn't logged in, give them link to /oauth/authorize
      innerNode = el.a(
        {
          href: config.mp_browser_uri + '/oauth/authorize' +
            '?app_id=' + config.app_id +
            '&redirect_uri=' + config.redirect_uri,
          className: 'btn btn-lg btn-block btn-success'
        },
        'Login with MoneyPot'
      );
    }

    return el.div(
      null,
      el.div(
        {className: 'col-md-2',},
        (this.state.waitingForServer) ?
          el.span(
            {
              className: 'glyphicon glyphicon-refresh rotate',
              style: { marginTop: '15px' }
            }
          ) : ''
      ),
      el.div(
        {className: 'col-md-8'},
        innerNode
      )
    );
  }
});

var HotkeyToggle = React.createClass({
  displayName: 'HotkeyToggle',
  _onClick: function() {
    Dispatcher.sendAction('TOGGLE_HOTKEYS');
  },
  render: function() {
    return (
      el.div(
        {className: 'text-center'},
        el.button(
          {
            type: 'button',
            className: 'btn btn-default btn-sm',
            onClick: this._onClick,
            style: { marginTop: '-15px' }
          },
          'Hotkeys: ',
          worldStore.state.hotkeysEnabled ?
            el.span({className: 'label label-success'}, 'ON') :
          el.span({className: 'label label-default'}, 'OFF')
        )
      )
    );
  }
});

var ChatToggle = React.createClass({
  displayName: 'ChatToggle',
  _onClick: function() {
    Dispatcher.sendAction('TOGGLE_CHAT');
  },
  render: function() {
    return (
      el.div(
        {className: 'text-center'},
        el.button(
          {
            type: 'button',
            className: 'btn btn-default btn-sm',
            onClick: this._onClick,
            style: { marginTop: '-15px',
                      float:'right'
              
            }
          },
          'Chat: ',
          worldStore.state.chatEnabled ?
            el.span({className: 'label label-success'}, 'ON') :
          el.span({className: 'label label-default'}, 'OFF')
        )
      )
    );
  }
});

var BetBox = React.createClass({
  displayName: 'BetBox',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  _onClientSeedChange:function(e){
    var str = e.target.value;
    Dispatcher.sendAction("UPDATE_CLIENT_SEED", str);
    this.forceUpdate();
  },
  render: function() {
    return el.div(
      null,
      el.div(
        {className: 'panel panel-default'},
        el.div(
          {className: 'panel-body'},
          el.div(
            {className: 'row'},
            el.div(
              {className: 'col-xs-6'},
              React.createElement(BetBoxWager, null)
            ),
            el.div(
              {className: 'col-xs-6'},
              React.createElement(BetBoxMultiplier, null)
            ),
            // HR
            el.div(
              {className: 'row'},
              el.div(
                {className: 'col-xs-12'},
                el.hr(null)
              )
            ),
            // Bet info bar
            el.div(
              null,
              el.div(
                {className: 'col-sm-6'},
                React.createElement(BetBoxProfit, null)
              ),
              el.div(
                {className: 'col-sm-6'},
                React.createElement(BetBoxChance, null)
              )
            ),
            el.div(
              {className:'row'},
              el.div(
                {className: 'col-xs-2'},
                ' '
              ),
              el.div(
                {className: 'col-xs-8', style:{textAlign:'center'}},
                el.span(
                  {className:'lead', style:{fontWeight:'bold'}},
                  'Client Seed'
                ),
                el.input(
                  {
                    type: 'text',
                    value: betStore.state.clientSeed.str,
                    onChange: this._onClientSeedChange,
                    className: 'form-control input-lg'
                  }
                )
              ),
              el.div(
                {className: 'col-xs-2'},
                ' '
              )
            ),
            el.br(),
            //Autobet
            el.div(
              {className:'row'},
              el.div(
                {className: 'col-xs-12'},
                React.createElement(ToggleAutomaticRoll1, null)
              )
            ),
            el.div(
              {className: 'row', id:'automaticBet'},
              el.div(
                {className: 'col-xs-12'},
                betStore.state.showAutomaticRoll ? React.createElement(ToggleAutomaticRoll, null) : ''
              )
            )
          )
        ),
        el.div(
          {className: 'panel-footer clearfix'},
          React.createElement(BetBoxButton, null)
        )
      ),
      React.createElement(HotkeyToggle, null)
    );
  }
});

var ToggleAutomaticRoll1 = React.createClass({
  displayName: 'ToggleAutomaticRoll',
    getInitialState: function() {
        return { waitingForServer: false };
    },

    _onStoreChange: function() {
        this.forceUpdate();
    },
    componentDidMount: function() {
        worldStore.on('change', this._onStoreChange);
    },
    componentWillUnmount: function() {
        worldStore.off('change', this._onStoreChange);
    },
  _displayAutomatic: function(){
        Dispatcher.sendAction("TOGGLE_SHOW_AUTOMATIC_ROLL");
        Dispatcher.sendAction('START_REFRESHING_USER');
        this.forceUpdate();
  },
  render: function() {
    return  el.div(null,
                el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                    el.div({className:'buttonMoreCenter'},
                        el.button(
                              {
                                    onClick: this._displayAutomatic,
                                    className: 'btn btn-lg btn-success btn-block',
                                    type: 'button',
                                    id: 'displayAutomatic'
                              },
                              !betStore.state.showAutomaticRoll ? 'Show Autobet' : 'Hide Autobet'
                            )
                    )
            )
        );
    }
});

var ToggleAutomaticRoll = React.createClass({
  displayName: 'ToggleAutomaticRoll',
    getInitialState: function() {
        return { waitingForServer: false };
    },
    _onStoreChange: function() {
        console.log("_onStoreChange");
        this.forceUpdate();
    },
    componentDidMount: function() {
        worldStore.on('change', this._onStoreChange);
    },
    componentWillUnmount: function() {
        worldStore.off('change', this._onStoreChange);
    },
  _AutomaticToggle: function(){
        Dispatcher.sendAction('AUTOMATIC_BET_WAGER_STATE');
        this.forceUpdate();
  },
  _numberOfBet: function(e){
      console.log(e.currentTarget.value);
      Dispatcher.sendAction("SET_AUTOMATIC_NUMBER_OF_BETS", e.currentTarget.value);
      this.forceUpdate();
  },
  _stopRoll: function(){
      Dispatcher.sendAction("STOP_ROLL");
  },
  _setMultiOnLose: function(e){
      Dispatcher.sendAction("SET_MULTI_ON_LOSE", e.currentTarget.value);
      this.forceUpdate();
  },
  _setStopMaxBalance: function(e){
    Dispatcher.sendAction("SET_STOP_MAX_BALANCE", e.currentTarget.value);
    this.forceUpdate();
  },
  _setStopMinBalance: function(e){
    Dispatcher.sendAction("SET_STOP_MIN_BALANCE", e.currentTarget.value);
    this.forceUpdate();
  },
  _newLimitNumberOfBet: function(e){
      console.log(betStore.state.disableNumberOfBet + "nuevo limite");
      var str = e.currentTarget.value;
      Dispatcher.sendAction("UPDATE_NUMBER_OF_BETS_LIMIT", {str: str});

      this.forceUpdate();
  },
    _makeBetHandler: function(cond) {
    var self = this;

    console.assert(cond === '<' || cond === '>');

        return function(e) {
                $('#wagerCoinState').attr('disabled','true');
                Dispatcher.sendAction('AUTOMATE_TOGGLE_ROLL');
                if(betStore.state.automaticToggle){
                  console.log('Placing bet...');

                  // Indicate that we are waiting for server response
                  self.setState({ waitingForServer: true });
                  var profitBet;
                  var hash = betStore.state.nextHash;
                  console.assert(typeof hash === 'string');

                  var wagerSatoshis = betStore.state.profitGained.num / 0.00000001;
                  var multiplier = betStore.state.multiplier.num;
                  var payoutSatoshis = wagerSatoshis * multiplier;

                  var number = helpers.calcNumber(
                  cond, helpers.multiplierToWinProb(multiplier)
                  );

                  var params = {
                      wager: wagerSatoshis,
                      client_seed: betStore.state.clientSeed.num,
                      hash: hash,
                      cond: cond,
                      target: number,
                      payout: payoutSatoshis
                  };

                  MoneyPot.placeSimpleDiceBet(params, {
                  success: function(bet) {
                    console.log('Successfully placed bet:', bet);
                    // Append to bet list
                    profitBet = bet.profit;
                    // We don't get this info from the API, so assoc it for our use
                    bet.meta = {
                      cond: cond,
                      number: number,
                      hash: hash,
                      isFair: CryptoJS.SHA256(bet.secret + '|' + bet.salt).toString() === hash
                    };

                    bet.wager = wagerSatoshis;
                    bet.uname = worldStore.state.user.uname;

                    Dispatcher.sendAction('CHANGE_TAB', 'MY_BETS');
                    Dispatcher.sendAction('NEW_BET', bet);

                    // Update next bet hash
                    Dispatcher.sendAction('SET_NEXT_HASH', bet.next_hash);

                    // Update user balance
                    Dispatcher.sendAction('UPDATE_USER', {
                      balance: worldStore.state.user.balance + bet.profit
                    });
                  },
                  error: function(xhr) {
                    console.log('Error');
                    if (xhr.responseJSON && xhr.responseJSON) {
                      alert(xhr.responseJSON.error);
                    } else {
                       alert('Internal Error');
                    }
                  },
                  complete: function() {
                      setTimeout(function() {
                          self.setState({ waitingForServer: false });
                          $('#wagerCoinState').attr('disabled',false);
                          // Force re-validation of wager
                          Dispatcher.sendAction('UPDATE_WAGER', {
                            str: betStore.state.wager.str
                          });


                              if(profitBet > 0) {
                                  Dispatcher.sendAction('RETURN_BASE_BET');
                              }else{
                                  Dispatcher.sendAction('AUGMENT_PROFIT', betStore.state.multiOnLose.str);
                              }
                              if(betStore.state.automaticToggle){

                                      if(cond === '<'){
                                          $('#automateBet-lo')[0].click();
                                      }else if(cond === '>') {
                                          $('#automateBet-hi')[0].click();
                                      }

                              }



                      }.bind(this), betStore.state.betVelocity);

                  }
                  });
                }

        };
    },
  render: function() {
          var winProb = helpers.multiplierToWinProb(betStore.state.multiplier.num);
          var error = betStore.state.wager.error || betStore.state.multiplier.error;
          var betHiLowNode
            if (worldStore.state.isLoading) {
              // If app is loading, then just disable button until state change
                betHiLowNode = el.button(
                    {type: 'button', disabled: true, className: 'btn btn-lg btn-block btn-default'},
                    'Loading...'
                );
            } else if (error) {
              // If there's a betbox error, then render button in error state

              var errorTranslations = {
                'CANNOT_AFFORD_WAGER': 'You cannot afford WAGER',
                'INVALID_WAGER': 'INVALID wager',
                'INVALID_MULTIPLIER': 'invalid MULTIPLIER',
                'MULTIPLIER_TOO_PRECISE': 'multiplier TOO PRECISE',
                'MULTIPLIER_TOO_HIGH': 'multiplier TOO HIGH',
                'MULTIPLIER_TOO_LOW': 'multiplier TOO LOW',
                'INVALID_AUTO_MULTIPLIER': 'INVALID multiplier on loss'
              };

              betHiLowNode =
              el.br(),
              el.button(
                {type: 'button',
                 disabled: true,
                 className: 'btn btn-lg btn-block btn-danger'},
                errorTranslations[error] || 'Invalid bet'
              );
            } else if (worldStore.state.user) {
                betHiLowNode =
                el.div({className:'row'},
                    el.br(),
                    el.div({className: 'col-lg-6 col-md-6 col-sm-6 col-xs-6'},
                    el.button(
                      {
                      type:'button',
                      className: 'btn btn-lg btn-primary btn-block',
                      id: 'automateBet-hi',
                      onClick: this._makeBetHandler('>')
                      },
                      el.span({className: 'bets unselectable', style:{position:'relative'}},
                        el.span(null,"Go Auto Hi "),
                        el.span({className: 'unselectable autoRateWin'}, '>'+helpers.calcNumber('>',winProb).toFixed(2))
                      )
                    )
                  ),
                  el.div({className: 'col-lg-6 col-md-6 col-sm-6 col-xs-6'},
                    el.button(
                      {
                      type:'button',
                      className: 'btn btn-lg btn-primary btn-block',
                      id: 'automateBet-lo',
                      onClick: this._makeBetHandler('<')
                      },
                      el.span({className: 'bets unselectable', style:{position:'relative'}},
                        el.span(null,"Go Auto Lo "),
                        el.span({className: 'unselectable autoRateWin'}, '<'+helpers.calcNumber('<',winProb).toFixed(2))
                      )
                    )
                  )
                );
            }else {
            // If user isn't logged in, give them link to /oauth/authorize
                betHiLowNode = el.a(
                {
                  href: config.mp_browser_uri + '/oauth/authorize' +
                    '?app_id=' + config.app_id +
                    '&redirect_uri=' + config.redirect_uri,
                  className: 'btn btn-lg btn-block btn-success'
                },
                'Login with MoneyPot'
                );
            }
      var buttonStopNode =
              el.div({className:'row'},
              el.br(),
              el.div({className: 'col-lg-12 col-md-12 col-sm-12 col-xs-12'},

                        el.input(
                            {
                                type: 'button',
                                className: ' btn btn-lg btn-block btn-danger',
                                value: 'STOP ROLL',
                                onClick: this._stopRoll
                            }
                        )
                    )
                );

    return  el.div(null,
                el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                    el.div({className:'automateBackground'},
                            (this.state.waitingForServer) ? buttonStopNode : betHiLowNode
                    )
                  ),
                  el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                      el.p(null, "limit amount of bets")
                  ),
                el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                    el.div({className:'automateBackground'},
                        el.div({className:'row'},
                            el.div({className:'col-lg-5 col-md-5 col-sm-6 col-xs-6'},
                                el.input(
                                    {
                                            id: 'radioStyle',
                                            name: 'numberOfBet',
                                            type: 'radio',
                                            defaultChecked: "checked",
                                            onChange: this._numberOfBet,
                                            value: 'false'
                                    }
                                    ),
                                    el.label({className:'radioPureCSS1'},
                                        el.span(null,
                                            el.span(null)
                                        ),
                                        el.label(null, "Unlimited")

                                    )
                                ),
                                el.div({className:'col-lg-7 col-md-7 col-sm-6 col-xs-6'},
                                el.input(
                                    {
                                       id: 'radioStyle',
                                       name: 'numberOfBet',
                                       type: 'radio',
                                       onChange: this._numberOfBet,
                                       value: 'true'
                                    }
                                    ),
                                    el.label({className:'radioPureCSS1'},
                                        el.span(null,
                                            el.span(null)
                                        ),
                                        el.label(null, "Limit")
                                    ),
                                    el.div(
                                      {className: 'input-group'},
                                      el.input(
                                          {
                                              type:'text',
                                              className:'autoAmount form-control input-lg',
                                              value: betStore.state.NumberOfBetLimit.str,
                                              onChange: this._newLimitNumberOfBet,
                                              disabled: betStore.state.disableNumberOfBet
                                          }
                                      ),
                                      el.span(
                                        {className: 'input-group-addon'},
                                        'Bets'
                                      )
                                    )
                                )
                            )
                      )
                  ),
                  el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                      el.p(null, "multiply on loss")
                  ),
                el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                    el.div({className:'automateBackground'},
                        el.div({className:'row'},
                            el.div({className: 'col-lg-3 col-md-3 col-sm-3 col-xs-3'}, ' '),
                            el.div({className:'col-lg-6 col-md-6 col-sm-6 col-xs-6 input-group'},
                                    el.input(
                                        {
                                            type:'text',
                                            className:'returnAmount form-control input-lg',
                                            onChange: this._setMultiOnLose,
                                            value: betStore.state.multiOnLose.str
                                        }
                                    ),
                                    el.span(
                                        {className: 'input-group-addon'},
                                        'X'
                                    )
                              ),
                              el.div({className: 'col-lg-3 col-md-3 col-sm-3 col-xs-3'}, ' ')
                            )
                      )
                  ),
                  el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                      el.p(null, "stop if balance >")
                  ),
                el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                    el.div({className:'automateBackground'},
                        el.div({className:'row'},
                            el.div({className: 'col-lg-3 col-md-3 col-sm-3 col-xs-3'}, ' '),
                            el.div({className:'col-lg-6 col-md-6 col-sm-6 col-xs-6 input-group'},
                                    el.input(
                                        {
                                            type:'text',
                                            className:'returnAmount form-control input-lg',
                                            onChange: this._setStopMaxBalance,
                                            value: betStore.state.stopMaxBalance
                                        }
                                    ),
                                    el.span(
                                        {className: 'input-group-addon'},
                                        'BTC'
                                    )
                              ),
                              el.div({className: 'col-lg-3 col-md-3 col-sm-3 col-xs-3'}, ' ')
                            )
                      )
                  ),
                  el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                      el.p(null, "stop if balance <")
                  ),
                  el.div({className:'col-lg-12 col-md-12 col-sm-12 col-xs-12'},
                    el.div({className:'automateBackground'},
                        el.div({className:'row'},
                            el.div({className: 'col-lg-3 col-md-3 col-sm-3 col-xs-3'}, ' '),
                            el.div({className:'col-lg-6 col-md-6 col-sm-6 col-xs-6 input-group'},
                                    el.input(
                                        {
                                            type:'text',
                                            className:'returnAmount form-control input-lg',
                                            onChange: this._setStopMinBalance,
                                            value: betStore.state.stopMinBalance
                                        }
                                    ),
                                    el.span(
                                        {className: 'input-group-addon'},
                                        'BTC'
                                    )
                              ),
                              el.div({className: 'col-lg-3 col-md-3 col-sm-3 col-xs-3'}, ' ')
                            )
                      )
                  )

        );
    }
});

var Tabs = React.createClass({
  displayName: 'Tabs',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  _makeTabChangeHandler: function(tabName) {
    var self = this;
    return function() {
      Dispatcher.sendAction('CHANGE_TAB', tabName);
    };
  },
  render: function() {
    return el.ul(
      {className: 'nav nav-tabs'},
      el.li(
        {className: worldStore.state.currTab === 'ALL_BETS' ? 'active' : ''},
        el.a(
          {
            href: 'javascript:void(0)',
            onClick: this._makeTabChangeHandler('ALL_BETS')
          },
          'Big Bets'
        )
      ),
      // Only show MY BETS tab if user is logged in
      !worldStore.state.user ? '' :
        el.li(
          {className: worldStore.state.currTab === 'MY_BETS' ? 'active' : ''},
          el.a(
            {
              href: 'javascript:void(0)',
              onClick: this._makeTabChangeHandler('MY_BETS')
            },
            'My Bets'
          )
        ),
      // Display Jackpot tab even to guests so that they're aware that
      // this casino has one.
      !config.recaptcha_sitekey ? '' :
        el.li(
          {className: worldStore.state.currTab === 'Jackpot' ? 'active' : ''},
          el.a(
            {
              href: 'javascript:void(0)',
              onClick: this._makeTabChangeHandler('Jackpot')
            },
            el.span(null, 'Jackpot ')
          )
        ),
      // Display faucet tab even to guests so that they're aware that
      // this casino has one.
      !config.recaptcha_sitekey ? '' :
        el.li(
          {className: worldStore.state.currTab === 'FAUCET' ? 'active' : ''},
          el.a(
            {
              href: 'javascript:void(0)',
              onClick: this._makeTabChangeHandler('FAUCET')
            },
            el.span(null, 'Faucet ')
          )
        )
    );
  }
});

var MyBetsTabContent = React.createClass({
  displayName: 'MyBetsTabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return el.div(
      null,
      el.table(
        {className: 'table'},
        el.thead(
          null,
          el.tr(
            null,
            el.th(null, 'ID'),
            el.th(null, 'Time'),
            el.th(null, 'User'),
            el.th(null, 'Wager'),
            el.th(null, 'Target'),
            el.th(null, 'Roll'),
            el.th(null, 'Profit')
          )
        ),
        el.tbody(
          null,
          worldStore.state.bets.toArray().map(function(bet) {
            return el.tr(
              {
                key: bet.bet_id || bet.id
              },
              // bet id
              el.td(
                null,
                el.a(
                  {
                    href: config.mp_browser_uri + '/bets/' + (bet.bet_id || bet.id),
                    target: '_blank'
                  },
                  bet.bet_id || bet.id
                )
              ),
              // Time
              el.td(
                null,
                helpers.formatDateToTime(bet.created_at)
              ),
              // User
              el.td(
                null,
                el.a(
                  {
                    href: config.mp_browser_uri + '/users/' + bet.uname,
                    target: '_blank'
                  },
                  bet.uname
                )
              ),
              // wager
              el.td(
                null,
                helpers.round10(bet.wager* 0.00000001, -8),
                ' BTC'
              ),
              // target
              el.td(
                null,
                bet.meta.cond + ' ' + bet.meta.number.toFixed(2)
              ),
              // roll
              el.td(
                null,
                bet.outcome + ' ',
                bet.meta.isFair ?
                  el.span(
                    {className: 'label label-success'}, 'Verified') : ''
              ),
              // profit
              el.td(
                {style: {color: bet.profit > 0 ? 'green' : 'red'}},
                bet.profit > 0 ?
                  '+' + helpers.round10(bet.profit*0.00000001, -8) :
                  helpers.round10(bet.profit*0.00000001, -8),
                ' BTC'
              )
            );
          }).reverse()
        )
      )
    );
  }
});

var JackpotTabContent = React.createClass({
  displayName: 'JackpotTabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('app_info_update', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('app_info_update', this._onStoreChange);
  },
   render: function() {
     var jackpotsize1;
     var jackpotsize2;
     if (worldStore.state.jackpotlist.lowwins.data[worldStore.state.jackpotlist.lowwins.end] != null){
        jackpotsize1 = (worldStore.state.currentAppwager - worldStore.state.jackpotlist.highwins.data[worldStore.state.jackpotlist.highwins.end].sitewager) * 0.00045;
        jackpotsize2 = (worldStore.state.currentAppwager - worldStore.state.jackpotlist.lowwins.data[worldStore.state.jackpotlist.lowwins.end].sitewager) * 0.00045;
      }else{
        jackpotsize1 = (worldStore.state.currentAppwager - (worldStore.state.currentAppwager - 2000000000)) * 0.00045;;
        jackpotsize2 = jackpotsize1;
      }
     return el.div(
       null,
       el.div({className:'panel panel-default'},
        el.div({className:'panel-body'},
          el.div({className:'well well-sm col-xs-12'},
            el.div({className: 'text-center h6'},'Jackpot 1 Size: ',
              el.span(null,
                helpers.commafy(helpers.convSatstoCointype(jackpotsize1).toString()) + ' ' + worldStore.state.coin_type
              )
            ),
            el.div({className: 'text-center h6'},'Jackpot 2 Size: ',
              el.span(null,
                helpers.commafy(helpers.convSatstoCointype(jackpotsize2).toString()) + ' ' + worldStore.state.coin_type
              )
            )
          ),
          el.div({className:'well well-sm col-xs-12'},
            el.div({className: 'text-center'},
              el.span({className: 'text-center h5', style:{fontWeight:'bold'}}, 'Previous Winners Jackpot 1'),
              el.table(
                {className: 'table text-left text-small', style: {fontWeight:'normal',marginTop:'5px'}},
                el.thead(
                  null,
                  el.tr(
                    null,
                    el.th(null, 'Date'),
                    el.th(null, 'User'),
                    el.th(null, 'Game'
                    el.th(null, 'Prize'),
                    el.th(null, 'ID')
                  )
                ),
                el.tbody(
                  null,
                  worldStore.state.jackpotlist.highwins.toArray().map(function(list) {
                    return el.tr(
                     { key: list.id},
                       // Time
                       el.td(
                         null,
                         list.created_at.substring(0,10)
                       ),
                       // User
                       el.td(
                         null,
                         el.a(
                           {
                             href: config.mp_browser_uri + '/users/' + list.uname,
                             target: '_blank'
                           },
                           list.uname
                         )
                       ),
                       // Game
                       el.td(
                         null,
                         list.kind
                       ),
                       // Prize
                       el.td(
                         null,
                         helpers.convNumtoStr(list.jprofit) + ' ' + worldStore.state.coin_type
                       ),
                      // bet id
                      el.td(
                        null,
                        el.a(
                          {
                            href: config.mp_browser_uri + '/bets/' + list.id,
                            target: '_blank'
                          },
                          list.id
                        )
                      )
                    );
                  }).reverse()
                )
              )

            ),
            el.div({className: 'text-center'},
              el.span({className: 'text-center h5', style:{fontWeight:'bold'}}, 'Previous Winners Jackpot 2'),
                el.table(
                  {className: 'table text-left text-small', style: {fontWeight:'normal',marginTop:'5px'}},
                  el.thead(
                    null,
                    el.tr(
                      null,
                      el.th(null, 'Date'),
                      el.th(null, 'User'),
                      el.th(null, 'Game'
                      el.th(null, 'Prize'),
                      el.th(null, 'ID')
                    )
                  ),
                  el.tbody(
                    null,
                    worldStore.state.jackpotlist.lowwins.toArray().map(function(list) {
                      return el.tr(
                       { key: list.id},
                         // Time
                         el.td(
                           null,
                           list.created_at.substring(0,10)
                         ),
                         // User
                         el.td(
                           null,
                           el.a(
                             {
                               href: config.mp_browser_uri + '/users/' + list.uname,
                               target: '_blank'
                             },
                             list.uname
                           )
                         ),
                         
                         // Prize
                         el.td(
                           null,
                           helpers.convNumtoStr(list.jprofit) + ' ' + worldStore.state.coin_type
                         ),
                        // bet id
                        el.td(
                          null,
                          el.a(
                            {
                              href: config.mp_browser_uri + '/bets/' + list.id,
                              target: '_blank'
                            },
                            list.id
                          )
                        )
                      );
                    }).reverse()
                  )
                )

              )

          ),
          el.div({className:'well well-sm col-xs-12'},
            el.div({className: 'text-center'},
              el.span({className: 'text-center h5', style:{fontWeight:'bold'}}, 'Jackpot Rules'),
              el.p({className:'text-left'},
                'The Jackpots are available to any user betting on our casino and can be won on any game so you can continue to play your favorite game. The Jackpot amounts are progressive based on the sites wager.'
                ),// end P
                el.p({className:'text-left'},
                  'In order to qualify for Jackpot 1 your bets wager must be at least ',
                  el.span(null,
                      helpers.convSatstoCointype(100).toString() + ' ' + worldStore.state.coin_type,
                      el.span(null,
                        '.  The winner is determined by the Raw_Outcome of the wager.  A winning bet is one that the Raw_Outcome is greater than 4294963000 for bets ',
                        el.span(null,
                          helpers.convSatstoCointype(100000).toString() + ' ' + worldStore.state.coin_type,
                          el.span(null,
                            ' and above.  This works out to a chance of 1 in 1 Million Bets.  Bets less than ',
                            el.span(null,
                              helpers.convSatstoCointype(100000).toString() + ' ' + worldStore.state.coin_type,
                              el.span(null,
                                ' and above ',
                                el.span(null,
                                  helpers.convSatstoCointype(100).toString() + ' ' + worldStore.state.coin_type,
                                  el.span(null,
                                    ' can still win the jackpot but the lower your wager the more challenging it becomes with ',
                                    el.span(null,
                                      helpers.convSatstoCointype(1000).toString() + ' ' + worldStore.state.coin_type,
                                      el.span(null,
                                        ' bets having 1% the chance a bet greater than or equal to ',
                                        el.span(null,
                                          helpers.convSatstoCointype(100000).toString() + ' ' + worldStore.state.coin_type,
                                          el.span(null,
                                              ' has. For example a bet of ',
                                              el.span(null,
                                                helpers.convSatstoCointype(1000).toString() + ' ' + worldStore.state.coin_type,
                                                el.span(null,' has to have a Raw_Outcome > 4294967252 in order to win.'
                                              )
                                            )
                                          )
                                        )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          )
                        )
                       )
                    )

                ),//end p
                el.p({className:'text-left'},
                  'In order to qualify for Jackpot 2 your bets wager must be at least ',
                  el.span(null,
                      helpers.convSatstoCointype(100).toString() + ' ' + worldStore.state.coin_type,
                      el.span(null,
                        '.  The winner is determined by the Raw_Outcome of the wager.  A winning bet is one that the Raw_Outcome is less than 4295 for bets ',
                        el.span(null,
                          helpers.convSatstoCointype(10000).toString() + ' ' + worldStore.state.coin_type,
                          el.span(null,
                            ' and above.  This works out to a chance of 1 in 1 Million Bets.  Bets less than ',
                            el.span(null,
                              helpers.convSatstoCointype(10000).toString() + ' ' + worldStore.state.coin_type,
                              el.span(null,
                                ' and above ',
                                el.span(null,
                                  helpers.convSatstoCointype(100).toString() + ' ' + worldStore.state.coin_type,
                                  el.span(null,
                                    ' can still win the jackpot but the lower your wager the more challenging it becomes with ',
                                    el.span(null,
                                      helpers.convSatstoCointype(100).toString() + ' ' + worldStore.state.coin_type,
                                      el.span(null,
                                        ' bets having 1% the chance a bet greater than or equal to ',
                                        el.span(null,
                                          helpers.convSatstoCointype(10000).toString() + ' ' + worldStore.state.coin_type,
                                          el.span(null,
                                              ' has. For example a bet of ',
                                              el.span(null,
                                                helpers.convSatstoCointype(100).toString() + ' ' + worldStore.state.coin_type,
                                                el.span(null,' has to have a Raw_Outcome < 42.9 in order to win.'
                                              )
                                            )
                                          )
                                        )
                                      )
                                    )
                                  )
                                )
                              )
                            )
                          )
                        )
                       )
                    )

                ),//end p
                el.p({className:'text-left'},
                  'To be fair to those who have wagered 90% of the Jackpot total will go to the winner and 10% will go to the highest wagered user for the day. The winner of each round will be announced in chat and the prizes will be manually transferred within 8 hours.'
                )
            )
          )
        )
       )
     );
   }
 });



var FaucetTabContent = React.createClass({
  displayName: 'FaucetTabContent',
  getInitialState: function() {
    return {
      // SHOW_RECAPTCHA | SUCCESSFULLY_CLAIM | ALREADY_CLAIMED | WAITING_FOR_SERVER
      faucetState: 'SHOW_RECAPTCHA',
      // :: Integer that's updated after the claim from the server so we
      // can show user how much the claim was worth without hardcoding it
      // - It will be in satoshis
      claimAmount: undefined
    };
  },
  // This function is extracted so that we can call it on update and mount
  // when the window.grecaptcha instance loads
  _renderRecaptcha: function() {
    worldStore.state.grecaptcha.render(
      'recaptcha-target',
      {
        sitekey: config.recaptcha_sitekey,
        callback: this._onRecaptchaSubmit
      }
    );
  },
  // `response` is the g-recaptcha-response returned from google
  _onRecaptchaSubmit: function(response) {
    var self = this;
    console.log('recaptcha submitted: ', response);

    self.setState({ faucetState: 'WAITING_FOR_SERVER' });

    MoneyPot.claimFaucet(response, {
      // `data` is { claim_id: Int, amount: Satoshis }
      success: function(data) {
        Dispatcher.sendAction('UPDATE_USER', {
          balance: worldStore.state.user.balance + data.amount
        });
        self.setState({
          faucetState: 'SUCCESSFULLY_CLAIMED',
          claimAmount: data.amount
        });
        // self.props.faucetClaimedAt.update(function() {
        //   return new Date();
        // });
      },
      error: function(xhr, textStatus, errorThrown) {
        if (xhr.responseJSON && xhr.responseJSON.error === 'FAUCET_ALREADY_CLAIMED') {
          self.setState({ faucetState: 'ALREADY_CLAIMED' });
        }
      }
    });
  },
  // This component will mount before window.grecaptcha is loaded if user
  // clicks the Faucet tab before the recaptcha.js script loads, so don't assume
  // we have a grecaptcha instance
  componentDidMount: function() {
    if (worldStore.state.grecaptcha) {
      this._renderRecaptcha();
    }

    worldStore.on('grecaptcha_loaded', this._renderRecaptcha);
  },
  componentWillUnmount: function() {
    worldStore.off('grecaptcha_loaded', this._renderRecaptcha);
  },
  render: function() {

    // If user is not logged in, let them know only logged-in users can claim
    if (!worldStore.state.user) {
      return el.p(
        {className: 'lead'},
        'You must login to claim faucet'
      );
    }

    var innerNode;
    // SHOW_RECAPTCHA | SUCCESSFULLY_CLAIMED | ALREADY_CLAIMED | WAITING_FOR_SERVER
    switch(this.state.faucetState) {
    case 'SHOW_RECAPTCHA':
      innerNode = el.div(
        { id: 'recaptcha-target' },
        !!worldStore.state.grecaptcha ? '' : 'Loading...'
      );
      break;
    case 'SUCCESSFULLY_CLAIMED':
      innerNode = el.div(
        null,
        'Successfully claimed ' + this.state.claimAmount*0.00000001 + ' BTC.' +
          // TODO: What's the real interval?
          ' You can claim again in 2 minutes.'
      );
      break;
    case 'ALREADY_CLAIMED':
      innerNode = el.div(
        null,
        'ALREADY_CLAIMED'
      );
      break;
    case 'WAITING_FOR_SERVER':
      innerNode = el.div(
        null,
        'WAITING_FOR_SERVER'
      );
      break;
    default:
      alert('Unhandled faucet state');
      return;
    }

    return el.div(
      null,
      innerNode
    );
  }
});

// props: { bet: Bet }
var BetRow = React.createClass({
  displayName: 'BetRow',
  render: function() {
    var bet = this.props.bet;
    return el.tr(
      {},
      // bet id
      el.td(
        null,
        el.a(
          {
            href: config.mp_browser_uri + '/bets/' + (bet.bet_id || bet.id),
            target: '_blank'
          },
          bet.bet_id || bet.id
        )
      ),
      // Time
      el.td(
        null,
        helpers.formatDateToTime(bet.created_at)
      ),
      // User
      el.td(
        null,
        el.a(
          {
            href: config.mp_browser_uri + '/users/' + bet.uname,
            target: '_blank'
          },
          bet.uname
        )
      ),
      // Wager
      el.td(
        null,
        helpers.round10(bet.wager*0.00000001, -8),
        ' BTC'
      ),
      // Target
      el.td(
        {
          className: 'text-right',
          style: {
            fontFamily: 'monospace'
          }
        },
        bet.cond + bet.target.toFixed(2)
      ),
      // // Roll
      // el.td(
      //   null,
      //   bet.outcome
      // ),
      // Visual
      el.td(
        {
          style: {
            //position: 'relative'
            fontFamily: 'monospace'
          }
        },
        // progress bar container
        el.div(
          {
            className: 'progress',
            style: {
              minWidth: '100px',
              position: 'relative',
              marginBottom: 0,
              // make it thinner than default prog bar
              height: '10px'
            }
          },
          el.div(
            {
              className: 'progress-bar ' +
                (bet.profit >= 0 ?
                 'progress-bar-success' : 'progress-bar-grey') ,
              style: {
                float: bet.cond === '<' ? 'left' : 'right',
                width: bet.cond === '<' ?
                  bet.target.toString() + '%' :
                  (100 - bet.target).toString() + '%'
              }
            }
          ),
          el.div(
            {
              style: {
                position: 'absolute',
                left: 0,
                top: 0,
                width: bet.outcome.toString() + '%',
                borderRight: '3px solid #333',
                height: '100%'
              }
            }
          )
        ),
        // arrow container
        el.div(
          {
            style: {
              position: 'relative',
              width: '100%',
              height: '15px'
            }
          },
          // arrow
          el.div(
            {
              style: {
                position: 'absolute',
                top: 0,
                left: (bet.outcome - 1).toString() + '%'
              }
            },
            el.div(
              {
                style: {
                  width: '5em',
                  marginLeft: '-10px'
                }
              },
              // el.span(
              //   //{className: 'glyphicon glyphicon-triangle-top'}
              //   {className: 'glyphicon glyphicon-arrow-up'}
              // ),
              el.span(
                {style: {fontFamily: 'monospace'}},
                '' + bet.outcome
              )
            )
          )
        )
      ),
      // Profit
      el.td(
        {
          style: {
            color: bet.profit > 0 ? 'green' : 'red',
            paddingLeft: '50px'
          }
        },
        bet.profit > 0 ?
          '+' + helpers.round10(bet.profit*0.00000001, -8) :
          helpers.round10(bet.profit*0.00000001, -8),
        ' BTC'
      )
    );
  }
});

var AllBetsTabContent = React.createClass({
  displayName: 'AllBetsTabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    return el.div(
      null,
      el.table(
        {className: 'table'},
        el.thead(
          null,
          el.tr(
            null,
            el.th(null, 'ID'),
            el.th(null, 'Time'),
            el.th(null, 'User'),
            el.th(null, 'Wager'),
            el.th({className: 'text-right'}, 'Target'),
            // el.th(null, 'Roll'),
            el.th(null, 'Outcome'),
            el.th(
              {
                style: {
                  paddingLeft: '50px'
                }
              },
              'Profit'
            )
          )
        ),
        el.tbody(
          null,
          worldStore.state.allBets.toArray().map(function(bet) {
            return React.createElement(BetRow, { bet: bet, key: bet.bet_id || bet.id });
          }).reverse()
        )
      )
    );
  }
});

var TabContent = React.createClass({
  displayName: 'TabContent',
  _onStoreChange: function() {
    this.forceUpdate();
  },
  componentDidMount: function() {
    worldStore.on('change', this._onStoreChange);
  },
  componentWillUnmount: function() {
    worldStore.off('change', this._onStoreChange);
  },
  render: function() {
    switch(worldStore.state.currTab) {
      case 'FAUCET':
        return React.createElement(FaucetTabContent, null);
          case 'Jackpot':
        return React.createElement(JackpotTabContent, null);
      case 'MY_BETS':
        return React.createElement(MyBetsTabContent, null);
      case 'ALL_BETS':
        return React.createElement(AllBetsTabContent, null);
      default:
        alert('Unsupported currTab value: ', worldStore.state.currTab);
        break;
    }
  }
});

var Footer = React.createClass({
  displayName: 'Footer',
  render: function() {
    return el.div(
      {
        className: 'text-center text-muted',
        style: {
          marginTop: '200px'
        }
      },
      'Powered by ',
      el.a(
        {
          href: 'https://www.moneypot.com'
        },
        'Moneypot'
      )
    );
  }
});

var App = React.createClass({
  displayName: 'App',
  render: function() {
    return el.div(
      {className: 'container'},
      // Navbar
      React.createElement(Navbar, null),
      // BetBox & ChatBox
      el.div(
        {className: 'row'},
        el.div(
          {className: 'col-sm-5'},
          React.createElement(BetBox, null)
        ),
        el.div(
          {className: 'col-sm-7'},
          React.createElement(ChatBox, null)
        )
      ),
      
	  // Tabs
      el.div(
        {style: {marginTop: '15px'}},
        React.createElement(Tabs, null)
      ),
      // Tab Contents
      React.createElement(TabContent, null),
      // Footer
      React.createElement(Footer, null)
    );
  }
});

React.render(
  React.createElement(App, null),
  document.getElementById('app')
);

// If not accessToken,
// If accessToken, then
if (!worldStore.state.accessToken) {
  Dispatcher.sendAction('STOP_LOADING');
  connectToChatServer();
} else {
  // Load user from accessToken
  MoneyPot.getTokenInfo({
    success: function(data) {
      console.log('Successfully loaded user from tokens endpoint', data);
      var user = data.auth.user;
      Dispatcher.sendAction('USER_LOGIN', user);
    },
    error: function(err) {
      console.log('Error:', err);
    },
    complete: function() {
      Dispatcher.sendAction('STOP_LOADING');
      connectToChatServer();
    }
  });
  // Get next bet hash
  MoneyPot.generateBetHash({
    success: function(data) {
      Dispatcher.sendAction('SET_NEXT_HASH', data.hash);
    }
  });
  // Fetch latest all-bets to populate the all-bets tab
  MoneyPot.listBets({
    success: function(bets) {
      console.log('[MoneyPot.listBets]:', bets);
      Dispatcher.sendAction('INIT_ALL_BETS', bets.reverse());
    },
    error: function(err) {
      console.error('[MoneyPot.listBets] Error:', err);
    }
  });
}

////////////////////////////////////////////////////////////
// Hook up to chat server

function connectToChatServer() {
  console.log('Connecting to chat server. AccessToken:',
              worldStore.state.accessToken);

  socket = io(config.chat_uri);

  socket.on('connect', function() {
    console.log('[socket] Connected');

    socket.on('disconnect', function() {
      console.log('[socket] Disconnected');
    });

    // When subscribed to DEPOSITS:

    socket.on('unconfirmed_balance_change', function(payload) {
      console.log('[socket] unconfirmed_balance_change:', payload);
      Dispatcher.sendAction('UPDATE_USER', {
        unconfirmed_balance: payload.balance
      });
    });

    socket.on('balance_change', function(payload) {
      console.log('[socket] (confirmed) balance_change:', payload);
      Dispatcher.sendAction('UPDATE_USER', {
        balance: payload.balance
      });
    });

    // message is { text: String, user: { role: String, uname: String} }
    socket.on('new_message', function(message) {
      console.log('[socket] Received chat message:', message);
      Dispatcher.sendAction('NEW_MESSAGE', message);
    });

    socket.on('user_joined', function(user) {
      console.log('[socket] User joined:', user);
      Dispatcher.sendAction('USER_JOINED', user);
    });

    // `user` is object { uname: String }
    socket.on('user_left', function(user) {
      console.log('[socket] User left:', user);
      Dispatcher.sendAction('USER_LEFT', user);
    });

    socket.on('new_bet', function(bet) {

  // ignore bets that wager < 0.01 btc (1,000,000 satoshi)
  if (bet.wager < 1000000) {
    return;
  }

  console.log('[socket] New bet:', bet);

  // Ignore bets that aren't of kind "simple_dice".
  if (bet.kind !== 'simple_dice') {
    console.log('[weird] received bet from socket that was NOT a simple_dice bet');
    return;
  }

  Dispatcher.sendAction('NEW_ALL_BET', bet);
  });

    // Received when your client doesn't comply with chat-server api
    socket.on('client_error', function(text) {
      console.warn('[socket] Client error:', text);
    });

    // Once we connect to chat server, we send an auth message to join
    // this app's lobby channel.

    var authPayload = {
      app_id: config.app_id,
      access_token: worldStore.state.accessToken,
      subscriptions: ['CHAT', 'DEPOSITS', 'BETS']
    };

    socket.emit('auth', authPayload, function(err, data) {
      if (err) {
        console.log('[socket] Auth failure:', err);
        return;
      }
      console.log('[socket] Auth success:', data);
      Dispatcher.sendAction('INIT_CHAT', data);
    });
  });
}

// This function is passed to the recaptcha.js script and called when
// the script loads and exposes the window.grecaptcha object. We pass it
// as a prop into the faucet component so that the faucet can update when
// when grecaptcha is loaded.
function onRecaptchaLoad() {
  Dispatcher.sendAction('GRECAPTCHA_LOADED', grecaptcha);
}

$(document).on('keydown', function(e) {
  var H = 72, L = 76, C = 67, X = 88, keyCode = e.which;

  // Bail is hotkeys aren't currently enabled to prevent accidental bets
  if (!worldStore.state.hotkeysEnabled) {
    return;
  }

  // Bail if it's not a key we care about
  if (keyCode !== H && keyCode !== L && keyCode !== X && keyCode !== C) {
    return;
  }

  // TODO: Remind self which one I need and what they do ^_^;;
  e.stopPropagation();
  e.preventDefault();

  switch(keyCode) {
    case C:  // Increase wager
      var upWager = betStore.state.wager.num * 2;
      Dispatcher.sendAction('UPDATE_WAGER', {
        num: upWager,
        str: upWager.toString()
      });
      break;
    case X:  // Decrease wager
      //var downWager = Math.floor(betStore.state.wager.num / 2);
          var downWager = betStore.state.wager.num / 2;
      Dispatcher.sendAction('UPDATE_WAGER', {
        num: downWager,
        str: downWager.toString()
      });

      break;
    case L:  // Bet lo
      $('#bet-lo').click();
      break;
    case H:  // Bet hi
      $('#bet-hi').click();
      break;
    default:
      return;
  }
});

window.addEventListener('message', function(event) {
  if (event.origin === config.mp_browser_uri && event.data === 'UPDATE_BALANCE') {
    Dispatcher.sendAction('START_REFRESHING_USER');
  }
}, false);
window.setInterval(function(){
          Dispatcher.sendAction('START_REFRESHING_USER');
 }, 300000);
