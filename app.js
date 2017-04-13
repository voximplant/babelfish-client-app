var LANGUAGES = {
    from: null,
    to: null
}, 
interimRecoginitionResult = "",
interimRecoginitionResultStable = "",
VOICE = null,
/* CHANGE TO YOUR APP NAME AND ACC NAME */
APPNAME = "babelfish",
ACCNAME = "demouser";

function chooseLang(type, lang) {
    switch(lang) {
        case "en":
            $('#'+type+'-lang').html("English");
        break;
        case "ru":
            $('#'+type+'-lang').html("Русский");
        break;
        case "es":
            $('#'+type+'-lang').html("Español");
        break;
        case "fr":
            $('#'+type+'-lang').html("Français");
        break;
        case "de":
            $('#'+type+'-lang').html("Deutsch");
        break;
    }
    LANGUAGES[type] = lang;
    if (LANGUAGES["from"] != null && LANGUAGES["to"] != null && LANGUAGES["to"] != LANGUAGES["from"]) $('#translation').removeAttr("disabled");
    else $('#translation').attr('disabled', true);
}

function chooseVoice(voice) {
    VOICE = voice;
    $('#voice').html(voice=="male"?"Male":"Female");
    if ( voice != null && $('#translation').is(":checked") ) $('#tts').removeAttr("disabled");
    else $('#tts').attr('disabled', true);
}

$('#tts').change(function(){
    if($(this).is(":checked")) {
        serverCall.sendMessage(JSON.stringify({ 
            type: "ENABLE_TTS",
            voice: VOICE=="male"?0:1
        }));
        peerCall.muteMicrophone();
    } else {
        serverCall.sendMessage(JSON.stringify({ 
            type: "DISABLE_TTS"
        }));
        peerCall.unmuteMicrophone();
    }
});

$('#translation').change(function() {
    if($(this).is(":checked")) {
        serverCall.sendMessage(JSON.stringify({ 
            type: "ASR_START", 
            fromLanguage: LANGUAGES["from"],
            toLanguage: LANGUAGES["to"] 
        })); 
    } else {
        status("");
        serverCall.sendMessage(JSON.stringify({ 
            type: "ASR_STOP"
        }));
    } 
});

function status(txt) {
    $('.status h3').html(txt);
}    

// Voximplant Web SDK
var sdk = VoxImplant.getInstance(), 
    serverCall, peerCall, username, 
    peerCalls = [], displayName,
    outbound = false;

sdk.init({
    micRequired: true,
    videoSupport: true,
    //serverIp: "web-gw-ru-13-218.voximplant.com",
    localVideoContainerId: "stage",
    remoteVideoContainerId: "stage",
    showDebugInfo: true,
    prettyPrint: true
})
.then(function(result) {
    console.log("Voximplant SDK ver. " + result.version);
    status("Requesting microphone access...");
    return sdk.connect();
})
.then(function(result) {
    $('.status').hide();
    $('.login-panel').css('display', 'flex');
    $('input[name=username]').focus();
})
.catch(function(err) {
    status("Initialization failed");
    console.log(err);
});

sdk.on(VoxImplant.Events.MicAccessResult, function(event) {
    if (event.result) status("Establishing connection....");
    else status("You have to allow access to your microphone");
});

sdk.on(VoxImplant.Events.IncomingCall, function(event) {
    var headers = event.call.headers();	
    console.log('Incoming call from: '+event.call.number()+' headers: '+headers);
    peerCall = event.call;
    peerCalls.push({ call: event.call, displayName: headers["X-DisplayName"] });
    peerCall.on(VoxImplant.CallEvents.Connected, onIncomePeerCallConnected);
    peerCall.on(VoxImplant.CallEvents.Disconnected, onPeerCallDisconnected);
    peerCall.on(VoxImplant.CallEvents.Failed, onPeerCallFailed);
    peerCall.on(VoxImplant.CallEvents.MediaElementCreated, onMediaElementCreated);	
    event.call.answer();
});

sdk.on(VoxImplant.Events.AuthResult, function(event) {
    if (event.result) {
        displayName = event.displayName;
        authorized();
    } else {
        var modalEl = document.createElement('div');
        modalEl.className = "auth-error";            
        modalEl.innerHTML = "Wrong login or password specified";
        // show modal
        mui.overlay('on', modalEl);
    }
});

function authorized() {
    
    $('.login-panel').hide();
    sdk.showLocalVideo(true, true);
    //
    status("Connecting to the conference...");
    $('.status').show();
    // Calling gatekeeper scenario
    serverCall = sdk.call({
        number: "joinconf",
        video: false,
        /* CONFERENCE ID SPECIFIED HERE */ 
        extraHeaders: { "X-Conference-Id": "100200300" }
    });
    serverCall.on(VoxImplant.CallEvents.Connected, onServerCallConnected);
    serverCall.on(VoxImplant.CallEvents.Disconnected, onServerCallDisconnected);
    serverCall.on(VoxImplant.CallEvents.Failed, onServerCallFailed);
    serverCall.on(VoxImplant.CallEvents.MessageReceived, onMessageReceived);
    serverCall.on(VoxImplant.CallEvents.MediaElementCreated, 
    (event) => {
        $(event.element).hide();
    });
    
}

function onServerCallConnected(event) {
    status("Waiting for another participant");
}

function onServerCallDisconnected(event) {
    status("Disconnected");
}

function onServerCallFailed(event) {
    status("Call Failed: " + event.reason);
}

function onMessageReceived(event) {
    try {
        result = JSON.parse(event.text);
    } catch(e) {
        console.log(e);
    }		
    processMessage(result);
}

function callExists(username) {
    for (var i = 0; i < peerCalls.length; i++) {
        if (peerCalls[i]["call"].number() == username) return true;
    }
    return false;
}	

function processMessage(result) {
    // Received list of peers?
    if (typeof result['peers'] != 'undefined') {
        
        for (var i = 0; i < result["peers"].length; i++) {
            // Calling all peers with callerid < username
            var callerid = result["peers"][i].callerid;
            if (callerid < username && !callExists(callerid)) {
                console.log("Calling " + result["peers"][i].displayName + " (" + result["peers"][i].callerid + ")");
                outbound = true;
                status("Calling participant...");
                peerCall = this.sdk.call({
                    number: result["peers"][i].callerid,
                    video: true,
                    customData: null, 
                    extraHeaders: { "X-DisplayName": displayName },
                    //H264first: true,
                    forceActive: true
                });

                peerCalls.push({ call: peerCall, displayName: result["peers"][i].displayName });
                peerCall.on(VoxImplant.CallEvents.Connected, onPeerCallConnected);
                peerCall.on(VoxImplant.CallEvents.Disconnected, onPeerCallDisconnected);
                peerCall.on(VoxImplant.CallEvents.Failed, onPeerCallFailed);
                peerCall.on(VoxImplant.CallEvents.MediaElementCreated, onMediaElementCreated);
            }
        }
    } else {

        if (result["result_type"] == "TRANSLATION") {
            $('#recognition').show();
            $('#recognition').html(result["text"]);
        } else if (result["result_type"] == "INTERIM_RESULT") {
            if (result["stability"] > 50) {
			    interimRecoginitionResult = "";
				interimRecoginitionResultStable = result["text"];
			} else interimRecoginitionResult = " " + result["text"]

			$(".status h3").html(interimRecoginitionResultStable + "<span className='interim-result'>" + interimRecoginitionResult + "</span>");

        } else if (result["result_type"] == "LOCAL_RECOGNITION") {
            interimRecoginitionResult = "";
            interimRecoginitionResultStable = "";
            $('.status h3').html(result["text"]);
        } else if (result["result_type"] == "LOCAL_TRANSLATION") {
            $('.status h3').html($('.status h3').html() + " => " + result["text"]);
        }


    }
}

function getNameFromURI(uri) {
    if (uri.indexOf('@') != -1) uri = uri.substr(0, uri.indexOf('@'));
    uri = uri.replace("sip:", "");
    return uri;
}

function removePeerCall(call) {
    // Remove IP call
    for (var k = 0; k < peerCalls.length; k++) {
        if (peerCalls[k]["call"] == call) {
            var num = getNameFromURI(peerCalls[k]["call"].number());
            peerCalls.splice(k, 1);
        }
    }
}

function onPeerCallConnected(event) {
    console.log("PEERCALL CONNECTED");
    status("Conversation with " + peerCalls[0].displayName);
    // 2nd active call is on hold by defaul - unholding
    peerCall.setActive(true);
    $('.controls').slideDown();         
}


function onIncomePeerCallConnected(event) {
    console.log("PEERCALL CONNECTED");
    status("Conversation with " + peerCalls[0].displayName);
    // 2nd active call is on hold by defaul - unholding
    peerCall.on(VoxImplant.CallEvents.Updated,function(){
        peerCall.off(VoxImplant.CallEvents.Updated);
        peerCall.setActive(true);
    });
    $('.controls').slideDown();
}

function onPeerCallDisconnected(event) {
    $('#recognition').html("");
    $('.controls, #recognition').hide();  
    console.log("PEERCALL DISCONNECTED");
    removePeerCall(event.call);
    status("Waiting for another participant");
    $('#voximplantlocalvideo').show();
}

function onPeerCallFailed(event) {
    console.log("PEERCALL FAILED");
    removePeerCall(event.call);
    status("Waiting for another participant");
}

function onMediaElementCreated(event) {        	
    $('#voximplantlocalvideo').hide();
    $('.mui-container').append($('.status'));
    $(event.element).removeAttr("width").removeAttr("height");	
}

// Login form    
$(".mui-form").submit(function(event) {
    username = $('input[name=username]').val();
    sdk.login(
        $('input[name=username]').val() + "@"+APPNAME+"."+ACCNAME+".voximplant.com",
        $('input[name=password]').val()
    );
    event.preventDefault();
});

jQuery(function($) {
    var $bodyEl = $('body'),
        $sidedrawerEl = $('#sidedrawer');


    function showSidedrawer() {
        // show overlay
        var options = {
        onclose: function() {
            $sidedrawerEl
            .removeClass('active')
            .appendTo(document.body);
        }
        };

        var $overlayEl = $(mui.overlay('on', options));

        // show element
        $sidedrawerEl.appendTo($overlayEl);
        setTimeout(function() {
            $sidedrawerEl.addClass('active');
        }, 20);
    }


    function hideSidedrawer() {
        $bodyEl.toggleClass('hide-sidedrawer');
    }


    $('.js-show-sidedrawer').on('click', showSidedrawer);
    $('.js-hide-sidedrawer').on('click', hideSidedrawer);
});