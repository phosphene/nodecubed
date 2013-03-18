var sys = require("util");
var net = require("net");

exports.createClient = function () {
  this.SINGLE_QUOTE        = '\'';
  this.BACKWARD_SLASH      = '\\';
  this.TILDA               = '~';
  this.SEMICOLON           = ';';
  this.BLANK_STRING        = '';
  this.COMMA               = ',';
  this.DOUBLE_QUOTES       = '"';
  this.NEWLINE             = '\n';
  this.CARRIAGE_RETURN     = '\r';
  this.LINE_FEED           = '\f';
  this.TAB                 = '\t';
  this.PERCENTAGE          = '\%';
  this.PARSEMODE_UNKNOWN   = 0;
  this.PARSEMODE_NUMERIC   = 1;
  this.PARSEMODE_STRING    = 2;
  this.PARSEMODE_DATETIME  = 3;
  this.PARSEMODE_BOOLEAN   = 4;
  this.responseStr         = null;
  this.insideQuotedString  = false;
  this.currentChar         = null;
  this.socket              = null;
  this.currentRowNum       = 0;
  this.rowDataHashMap      = {};
  this.unlabelledRowData   = new Array();
  this.lastErrorMsg        = '';
  this.responsePending     = false;
  this.cancelPending       = false;
  this.terminatorChar      = '';
  this.lastLabel           = '';
  this.terminatorCharFound = false;
  this.database            = '';
  this.login               = null;
  this.password            = null;
  this.settingsStr         = null;
  this.parsingSettings     = false;
};

var onopen    = exports.createClient.prototype.onopen    = function ()    { };
var onlogin   = exports.createClient.prototype.onlogin   = function ()    { };
var onsuccess = exports.createClient.prototype.onsuccess = function (l)   { };
var onfailure = exports.createClient.prototype.onfailure = function (l)   { };
var onerror   = exports.createClient.prototype.onerror   = function (l,e) { };
var onclose   = exports.createClient.prototype.onclose   = function ()    { };

var connect   = exports.createClient.prototype.connect   = function (host,port,database,login,password) {
	
	//console.log(host + ":" + port + ":" + database + ":" + login + ":" + password);
	
	var socket    = net.createConnection(port,host);
	socket.setMaxListeners(0);
	this.socket   = socket;
	this.database = database;
	this.login    = login;
	this.password = password;
	var client    = this;

	socket.on('connect', function () {
		client.onopen();
		var label = "LOGIN";
		client.registerLabel(label);
		var command = "label " + label + ": " + "CONNECT " + login + " IDENTIFIED BY '" + password + "';";
		//console.log(command);
		socket.write(command);
	});

	socket.on('data', function (data) {
		//if (client.lastLabel == null) client.lastLabel = "LOGIN";
		switch (client.lastLabel) {
			case "LOGIN":
				client.clearRowData("LOGIN");
				client.registerLabel("SETDB");
				client.responsePending = true;
				var command = "label SETDB: SET DATABASE " + client.database + ";"
				//console.log(command);
				socket.write(command);
				break;
				
			case "SETDB":
				client.clearRowData("SETDB");
				client.onlogin();
				break;
		}
	});
};

var getSettings = exports.createClient.prototype.getSettings = function (callback) {
	var client = this;
	client.socket.write("get config *;");
	client.settingsStr = "";
	client.socket.on('data', function (data) {
		var b = data.toString();
		if (!client.parsingSettings && b.length > 6 && b.substr(0, 6) != "CKPNUM") return;
		else client.parsingSettings = true;
		var c = "";
		for (var i = 0; i < b.length; i++) {
			client.settingsStr += b.charAt(i);
		}
		if (client.settingsStr[client.settingsStr.length - 1] == '~') {
			client.parsingSettings = false;
			callback();
		}
	});
}

var execute   = exports.createClient.prototype.execute   = function (label,command,callback) {
	var client = this;
	if (label != null) client.registerLabel(label);
	client.responsePending = true;
	var cmd = (label != null) ? "label " + label + ": " + command + ";" : command + ";";
	//console.log("Execute: " + cmd);
	client.socket.write(cmd);
	client.socket.on('data', function (data) {				
		//console.log("lastLabel: " + client.lastLabel);
		if (client.lastLabel == label) {
			client.readResponse(data);
			callback();
		}
	});
}

var close     = exports.createClient.prototype.close     = function () {
	this.socket.end();
	this.socket = null;
}

var getNumRowResponses = exports.createClient.prototype.getNumRowResponses = function(label) {
	//console.log("getNumRowResponses: " + this.rowDataHashMap[label].length);
	
    if (label == null ||
    	label.length <= 0 ||
    	!(label in this.rowDataHashMap) ||
    	this.rowDataHashMap[label] == null) return -1;
    else return this.rowDataHashMap[label].length;
}

exports.createClient.prototype.getRowData = function(rowNum, label) {
    if (label == null ||
    	label.length <= 0 ||
    	!(label in this.rowDataHashMap) ||
    	this.rowDataHashMap[label] == null) {
    	return getNumRowResponses(label);
    } else {
        var rd = this.rowDataHashMap[label];
        if (rowNum < rd.length) {
            return rd[rowNum];
        } else return null;
    } 
}

exports.createClient.prototype.clearRowData = function (label) {
	if (label == null ||
    	label.length <= 0 ||
    	!(label in this.rowDataHashMap) || 
    	this.rowDataHashMap[label] == null) return;

	this.currentRowNum = 0;
    var rd = this.rowDataHashMap[label];
    var i = 0;
    for (i = 0; i < rd.length; i++) {
        delete rd[i];
    }
    rd = new Array();
    this.rowDataHashMap[label] = rd;
}

exports.createClient.prototype.registerLabel = function (label) {
    if (label in this.rowDataHashMap) {
        this.lastErrorMsg = "Cannot register label. A label with this name already exists.";
        return false;
    } else {
    	this.lastLabel = label;
        var rd = new Array();
        this.rowDataHashMap[label] = rd;
        return true;
    }
}

exports.createClient.prototype.readResponse = function(data) {
    // Parse the response data available inside the event object.
	//console.log("Data: " + data);
	
	var e = (typeof data=="string") ? new String(data) : new String(data.toString('ascii'));
	//console.log(e);
	
	this.lastBlockReceived = e;
	
    if (this.responseStr == null) {
        this.responseStr = e;
    }
    else {
        this.responseStr += e;
    }

    if (this.responsePending == true) {
        this.terminatorChar = this.TILDA;
    }
    else {
        this.terminatorChar = this.SEMICOLON;
    }

    //console.log("this.responseStr: " + this.responseStr);

    
    if (!this.parseResponse()) {
    	  this.terminatorCharFound = false;
        this.onfailure(this.lastLabel);
    }
    else {
        if (this.terminatorCharFound) {
        	  this.terminatorCharFound = false;

            this.onsuccess(this.lastLabel);
        }
    }

    return;
}

exports.createClient.prototype.parseResponse = function() {
    var indexMsgStart = 0;
    var indexMsgEnd = 0;
    var i;
    var cmd;
    var rd = null;
    var strArr;
    var truncStr;
    var index1 = 0;
    var statementLabel = false;

    insideQuotedString = false;
	
    //console.log("term char = " + this.terminatorChar + " response pending = " + this.responsePending);
    for (i = 0; i < this.responseStr.length; i++) {

    	this.currentChar = this.responseStr.charAt(i);

        if (this.currentChar == this.SINGLE_QUOTE) {
            if (i >= 1) {
                if (this.responseStr.charAt(i - 1) != this.BACKWARD_SLASH) {
                    insideQuotedString = !insideQuotedString;
                }
            }
            else {
                insideQuotedString = !insideQuotedString;
            }
        }
        else if (((this.currentChar == '~') && (!insideQuotedString)) ||
          ((this.currentChar == ';') && (!insideQuotedString))) {
            if (((this.currentChar == '~') && (this.terminatorChar == this.TILDA)) ||
               ((this.currentChar == ';') && (this.terminatorChar == this.SEMICOLON))) {
                this.terminatorCharFound = true;
            }
            
            if (((this.currentChar == '~') && (this.terminatorChar == this.TILDA)) ||
               ((this.currentChar == ';') && (this.terminatorChar == this.SEMICOLON))) {
                this.responsePending = false;
            }

            // we have the end point of the command.
            indexMsgEnd = i;
            cmd = this.responseStr.substring(indexMsgStart, indexMsgEnd);

            var cmdstart = cmd.substring(0, 8);
            var responseString = this.responseStr;
            
            // check that we have a "row from " message.
            if (cmdstart == "row from") {
                // Do nothing	 	
            }
            else if (cmdstart == "statemen") {
            	//console.log("Statement: " + this.responseStr);
                statementLabel = true;
                //break;
            }
            else {
                this.lastErrorMessage = "Got an unexpected message whilst processing data.";
                // Clear out the response string and return false
                this.responseStr = this.BLANK_STRING;
                return false;
                /*
                // Old code
                indexMsgStart = i+1;
                continue;
                */
            }

            // Get the label, if there is one, and then the RowData repository
            strArr = cmd.split(" ");
            if (strArr.length > 0) {
                var labelName = null;

                if (statementLabel == true) {
                    labelName = strArr[1].substring(0,strArr[1].length - 1);
                }
                else {
                    if (strArr[2].indexOf('(') >= 0) {
                        labelName = strArr[2].substring(0, strArr[2].indexOf('('));
                    }
                    else {
                        labelName = strArr[2];
                    }
                }

                if (labelName in this.rowDataHashMap) {               		
                    if (this.rowDataHashMap[labelName] !== null) {
                        this.lastLabel = labelName;
                        rd = this.rowDataHashMap[labelName];
                    }
                }
                else {
                    rd = this.unlabelledRowData;
                }

                //console.log("Data for label: " + labelName);
                if (!this.parseRowData(cmd, rd)) {
                    this.responseStr = this.responseStr.substring(indexMsgEnd + 1);
                    //return false;
                }
                else {
                    indexMsgStart = i + 1;
                    continue;
                }
            }
        }
    }


    if ((this.terminatorCharFound == true) && (this.terminatorChar == this.TILDA)) {


        // Get the label, if there is one, and then the RowData repository
        strArr = cmd.split(" ");
        if (strArr.length > 0) {
            if (statementLabel == true) {
                var commandLabelStr = strArr[1];
                var commandLabel = commandLabelStr.substring(0, commandLabelStr.length - 1);                
            }
            else {
                var commandLabelStr = strArr[2];
                if (commandLabelStr.indexOf('(') >= 0) {
                    var commandLabel = commandLabelStr.substring(0, commandLabelStr.indexOf('('));
                }
                else {
                    var commandLabel = commandLabelStr.substring(0, commandLabelStr.length - 1);
                }                
            }

            if (commandLabel in this.rowDataHashMap) {
                if (this.rowDataHashMap[commandLabel] !== null) {
                    this.lastLabel = commandLabel;
                    rd = this.rowDataHashMap[commandLabel];
                }
            }
            else {
                rd = this.unlabelledRowData;
            }
        }

        var stmtSearchString = "statement " + this.lastLabel + ": ";

        // Search the string to see if it contains the string "statement <labelname>:".

        // This indicates that the response is complete and either succeeded or failed,
        // depending on the last part of the message.
        index1 = this.responseStr.indexOf(stmtSearchString);

        if (index1 != -1) {
            // We have found the search string. Now we just need to check
            // whether the last command was a success or not. It was a success
            // if we must find the term "executed:".

            var s = this.responseStr.substring(index1 + stmtSearchString.length, index1 + stmtSearchString.length + 9);
            if (s == "executed:") {
                // Command succeeded
                this.responseStr = this.BLANK_STRING;
                if (this.cancelPending) 
                {
                	this.cancelPending = false;
                	this.currentRowNum = 0;
                }
            }
            else {
                // Command failed. Save the error message.
                this.lastErrorMsg = this.responseStr.substring(index1 + stmtSearchString.length);
                this.responseStr = this.BLANK_STRING;
                if (this.cancelPending) 
                	this.cancelPending = false;
                return false;
            }
        }
    }

    if (indexMsgEnd == 0)
        return true;

    // remove the characters we've already processed.
    if (indexMsgEnd + 1 >= this.responseStr.length) {
        // We're right at the end of the string. Replace
        // by an empty string.
        this.responseStr = this.BLANK_STRING;
    }
    else {
        truncStr = this.responseStr.substring(indexMsgEnd + 1);
        this.responseStr = truncStr;
    }

    return true;
}

exports.createClient.prototype.parseRowData = function(row, rd) {
    var mode = this.PARSEMODE_UNKNOWN;
    var index11;
    var index21;
    var index1;
    var index2;
    var i;
    var data = null;
    var rowArray = new Array();
    rowArrayIndex = 0;

    //console.log("row: " + row);
        
    // We want to first extract everything between the first open brace and the last close brace.
    index11 = row.indexOf('(') + 1;

    if (index11 == 0) {
    	
        this.lastErrorMsg = " Error parsing row data - couldn't find the opening brace.";
        return false;
    }

    index21 = row.lastIndexOf(')');

    if (index21 == -1) {
        this.lastErrorMsg = " Error parsing row data - couldn't find the closing brace.";
        return false;
    }

    // Extract the contents
    data = row.substring(index11, index21);

    //console.log("lastLabel: " + this.lastLabel);

    // Now we need to split up each column element. They are separated by commas, but
    // it is possible that a comma may appear within a string, or there may be inverted
    // commas within a string, so we need to check for these.
    // Strings will be returned without inverted commas, and date, time and datetime objects
    // will have the raw string representation extracted and returned. i.e., NOT as 'date("2008-04-22")'
    // but instead as '2008-04-22' (without the quotes).
    index1 = 0;
    index2 = 0;

    for (i = 0; i < data.length; i++) {
        if (mode == this.PARSEMODE_UNKNOWN) {
            // We need to determine what mode to process this data in. We will also
            // set index1 and if we are parsing non-numeric types then we will also
            // jump the counter to the start of the relevant string section. This will
            // make it slightly easier to find the end of the string.
            if (this.isNumeric(data.charAt(i))) {
                mode = this.PARSEMODE_NUMERIC;
                index1 = i;
                if (data.length == (i + 1)) {
                    // if we've got a single digit at the end of the string we
                    // need to extract it. Lets do it in the numeric section below.
                    // In this case we need to process this character again.
                    i--;
                }
                continue;
            }
            else if (data.charAt(i) == this.SINGLE_QUOTE) {
                mode = this.PARSEMODE_STRING;
                index1 = i + 1;
                continue;
            }
            else if (data.length >= (i + 4)) {
                if (data.substring(i, i + 4) == "true") {
                    mode = this.PARSEMODE_BOOLEAN;
                    index1 = i;
                    continue;
                }
                else {
                    if (data.length >= (i + 5)) {
                        if (data.substring(i, i + 5) == "false") {
                            mode = this.PARSEMODE_BOOLEAN;
                            index1 = i;
                            continue;
                        }
                    }
                    else {
                        if (data.length >= (i + 6)) {
                            if ((data.substring(i, i + 6) == "date '") ||
               (data.substring(i, i + 6) == "time '")) {
                                mode = this.PARSEMODE_DATETIME;
                                index1 = i + 6;
                                i += 5; 		// it will add one extra for us.
                                continue;
                            }
                            else
                                if ((data.substring(i, i + 5) == "date'") ||
               									(data.substring(i, i + 5) == "time'")) {
                                mode = this.PARSEMODE_DATETIME;
                                index1 = i + 5;
                                i += 4; 		// it will add one extra for us.
                                continue;
                            }
                            else {
                                if (data.length >= (i + 11)) {
                                    if (data.substring(i, i + 11) == "timestamp '") {
                                        mode = this.PARSEMODE_DATETIME;
                                        index1 = i + 11;
                                        i += 10; 	// it will add one extra for us.
                                        continue;
                                    }
                                }
                                else
                                    if (data.length >= (i + 10)) {
                                    if (data.substring(i, i + 11) == "timestamp'") {
                                        mode = this.PARSEMODE_DATETIME;
                                        index1 = i + 10;
                                        i += 9; 	// it will add one extra for us.
                                        continue;
                                    }
                                }
                                
                                this.lastErrorMsg = "Couldn't determine how to interpret the returned data.\n";
                                return false;
                            }
                        }
                    }
                }
            }
            else {
                this.lastErrorMsg = "Couldn't determine how to interpret the returned data.\n";
                return false;
            }
        }
        else if (mode == this.PARSEMODE_NUMERIC) {
            // we're looking for a comma to delimit the data
            if (data.charAt(i) == ',') {
                if (i == 0) {
                    this.lastErrorMsg = "Error parsing data - it can't start with a comma.\n";
                    return false;
                }

                // add the string representation of this numeric to the array and reset the mode.
                rowArray[rowArrayIndex] = data.substring(index1, i);
                rowArrayIndex++;
                mode = this.PARSEMODE_UNKNOWN;
                continue;
            }

            // check if we're at the end of the string
            if (data.length == (i + 1)) {
                rowArray[rowArrayIndex] = data.substring(index1);
                rowArrayIndex++;
                mode = this.PARSEMODE_UNKNOWN;
                continue;
            }
        }
        else if (mode == this.PARSEMODE_STRING) {
            // TODO: We need a different way to parse strings that is secure. This current
            // method is still open to hacking.

            // We will use the following methods to determine the end of a string. This is not failsafe.
            //		1. Inverted comma followed by end of string
            //		2. Inverted comma followed by a comma followed by:
            //			(a.) a digit
            //      (b.) the character f (for false) or t (for true)
            //			(c.) the string "date '", "time '", or "timestamp '"
            //			(d.) another inverted comma

            if (data.charAt(i) != this.SINGLE_QUOTE) {
                continue;
            }

            // If the character before this quote is a backslash, then ignore this quote.
            if (i > 0) {
                if (data.charAt(i - 1) == this.BACKWARD_SLASH) {
                    continue;
                }
            }

            // check test 1.
            if ((i + 1) == data.length) {
                // test 1 succeeded.
                index2 = i;
            }
            else {
                // pre-requisite for test 2a - 2d.
                if (data.length <= (i + 2)) {
                    continue;
                }

                // pre-requisite for test 2
                if (data.charAt(i + 1) != this.COMMA) {
                    continue;
                }

                // check test 2a and test 2b and 2d.
                if (this.isNumeric(data.charAt(i + 2))) {
                    // test 2a succeeded.
                    index2 = i;
                }
                else if (data.charAt(i + 2) == this.SINGLE_QUOTE || 
                	       data.charAt(i + 2) == "f" || data.charAt(i + 2) == "F" ||
                	       data.charAt(i + 2) == "t" || data.charAt(i + 2) == "T" ) {
                    index2 = i;
                }
                else {
                    // pre-requisite for test 2c.
                    if (data.length < (i + 8)) {
                        continue;
                    }

                    // check test 2c. (partial)
                    if ((data.substring(i + 2, i + 8) == "date '") ||
                        (data.substring(i + 2, i + 8) == "time '")) {
                        index2 = i;
                    }
                    else
                        if ((data.substring(i + 2, i + 7) == "date'") ||
           							(data.substring(i + 2, i + 7) == "time'")) {
                        index2 = i;
                    }
                    else {
                        if (data.length < (i + 13)) {
                            continue;
                        }

                        // check the rest of test 2c.
                        if (data.substring(i + 2, i + 13) == "timestamp '") {
                            index2 = i;
                        }
                        else
                            if (data.substring(i + 2, i + 12) == "timestamp'") {
                            index2 = i;
                        }
                    }
                }
            }

            // if we get here then we've matched something.
            if (index2 >= index1) {
                rowArray[rowArrayIndex] = data.substring(index1, index2);
                rowArrayIndex++;
                mode = this.PARSEMODE_UNKNOWN;
                i++;
            }
            else {
                // Shouldn't get here.
                this.lastErrorMsg = "Error parsing string - couldn't find its end.\n";
                var localResponseStr = this.responseStr;
                return false;
            }
        }
        else if (mode == this.PARSEMODE_DATETIME) {
            // we're looking for the string "'" (inside the quotes) to delimit the data
            index2 = data.indexOf("'", i);

            if (index2 == -1) {
                this.lastErrorMsg = "Error parsing row data - couldn't find the end of the date/time object.\n";
                return false;
            }
            else {
                rowArray[rowArrayIndex] = data.substring(index1, index2);
                rowArrayIndex++;
                mode = this.PARSEMODE_UNKNOWN;
                i = index2 + 1; 		// advance to the next value.
                continue;
            }
        }
        else if (mode == this.PARSEMODE_BOOLEAN) {
            // we're looking for a comma to delimit the data
            if (data.charAt(i) == ',') {
                if (i == 0) {
                    this.lastErrorMsg = "Error parsing data - it can't start with a comma!\n";
                    return false;
                }

                // add the string representation of this boolean to the array and reset the mode.
                var boolData = data.substring(index1, i);
                if (boolData == "true") {
                    rowArray[rowArrayIndex] = "true";
                    rowArrayIndex++;
                }
                else if (boolData =="false") {
                    rowArray[rowArrayIndex] = "false";
                    rowArrayIndex++;
                }
                else {
                    this.lastErrorMsg = "Error parsing string - expected to get \"true\" or \"false\"."
      									+ "Instead got \"" + boolData + "\".";
                    return false;
                }
                mode = this.PARSEMODE_UNKNOWN;
                continue;
            }

            // check if we're at the end of the string
            if (data.length == (i + 1)) {
                // add the string representation of this boolean to the array and reset the mode.
                var boolData = data.substring(index1);
                if (boolData == "true") {
                    rowArray[rowArrayIndex] = "true";
                    rowArrayIndex++;
                }
                else if (boolData == "false") {
                    rowArray[rowArrayIndex] = "false";
                    rowArrayIndex++;
                }
                else {
                    this.lastErrorMsg = "Error parsing string - expected to get \"true\" or \"false\"."
                        + "Instead  got \"" + boolData + "\".";
                    return false;
                }

                mode = this.PARSEMODE_UNKNOWN;
                continue;
            }
        }
        else {
            // This should never happen. We should always be in one of the listed modes.
            this.lastErrorMsg = "Invalid mode whilst parsing raw row data.";
            return false;
        }
    }

    rd[this.currentRowNum] = rowArray;
    this.currentRowNum++;

    return true;
}

exports.createClient.prototype.isNumeric = function(strString) {
    var strValidChars = "0123456789";
    var strChar;
    var blnResult = true;

    if (strString.length == 0) return false;

    //  test strString consists of valid characters listed above
    for (i = 0; i < strString.length && blnResult == true; i++) {
        strChar = strString.charAt(i);
        if (strValidChars.indexOf(strChar) == -1) {
            blnResult = false;
        }
    }
    return blnResult;
}

exports.createClient.prototype.unescapeString = function(str) {
  var sb = str;
  var i = 0;
  var unescapedStr = this.BLANK_STRING;

	unescapedStr = str.replace(/\\\\/g,"\\");
	unescapedStr = unescapedStr.replace(/\\"/g, "\'");
	unescapedStr = unescapedStr.replace(/\\'/g, "\'");
	unescapedStr = unescapedStr.replace(/\\n/g, "\n");
	unescapedStr = unescapedStr.replace(/\\r/g, "\r");
	unescapedStr = unescapedStr.replace(/\\f/g, "\f");
	unescapedStr = unescapedStr.replace(/\\t/g, "\t");
	unescapedStr = unescapedStr.replace(/%%/g, "%");
	return unescapedStr;
}
