/**
 * TEMASYS SKYLINK CONFERENCE CENTER
 * Author: Nathaniel Currier
 * Version: 1.0.0
 */

let sl = new Skylink();

//Safari Sucks Section
let AudioContext = window.AudioContext || window.webkitAudioContext || false;

// globals
let ConferenceCenter = null;
let participants = [];
let messageHistory = [];
let videos = [];
let peerStatsChecker = null;
let gesture = { start: null, end: null };
let isResizing = false;

// Global Elements
let viewContainer = document.getElementById("content");
let commandBar = document.getElementById("command-bar");
let captureFrame = document.getElementById("capture-frame");
let participantsContainer = document.getElementById("participants-list");
let participantTemplate = document.getElementById("participant");
let messageContainer = document.getElementById("messages");
let messageTemplate = document.getElementById("message");

// View Templates
let welcomeTemplate = document.getElementById("welcome-view");
let precallTemplate = document.getElementById("precall-view");
let postcallTemplate = document.getElementById("postcall-view");

// Custom Events
let setupRequiredEvent = new Event("SETUP_REQUIRED");
let setupCompletedEvent = new Event("SETUP_COMPLETE");
let preCallCompleteEvent = new Event("PRE_CALL_COMPLETE");
let callCompleteEvent = new Event("CALL_COMPLETE");
let swipeRightEvent = new Event("SWIPE_RIGHT");
let swipeLeftEvent = new Event("SWIPE_LEFT");

//Skylink Event Handlers
let mediaSuccess = function(
  stream,
  isScreenSharing,
  isAudioFallback,
  streamId
) {
  return true;
};

let peerJoin = function(peerId, peerInfo, isSelf) {
  if (isSelf) {
    ConferenceCenter.localPeerId = peerId;
  }

  let view = document.importNode(participantTemplate.content, true);
  view.querySelector(".participant-item").id = "part_" + peerId;
  view.querySelector(".participant-item-name").innerText =
    peerInfo.userData.username || "Anonymous";
  participantsContainer.appendChild(view);

  participants[peerId] = new Person(peerInfo.userData.username, isSelf);

  Utils.Network.geoIPLookup(); // broadcast location to peers on join
  //TODO: Should probably cache this.
};

let peerLeft = function(peerId, peerInfo, isSelf) {
  let videoDOM = document.getElementById("vmask_" + peerId) || null;
  let participantDOM = document.getElementById("part_" + peerId) || null;

  if (videoDOM) {
    videoDOM.parentNode.removeChild(videoDOM);
  }
  if (participantDOM) {
    participantDOM.parentNode.removeChild(participantDOM);
  }
  if (participants[peerId]) {
    delete participants[peerId];
  }
  if (videos[peerId]) {
    delete videos[peerId];
  }
};

let peerUpdated = function(peerId, peerInfo, isSelf) {
  participants[peerId].status.audioMuted = peerInfo.mediaStatus.audioMuted;
  participants[peerId].status.videoMuted = peerInfo.mediaStatus.videoMuted;
};

let incomingMessage = function(message, peerId, peerInfo, isSelf) {
  // handle app control messages
  if (message.content.action) {
    switch (message.content.action) {
      case "PEER_LOCATION_UPDATE":
        participants[peerId].ipData = message.content.content;
        console.log(participants[peerId].ipData);
        //clean up
        var partPanel = document.getElementById("part_" + peerId);
        partPanel.querySelector(".participant-item-locale").innerText =
          message.content.content.country_name;
        console.log(message);
        break;
      case "REMOTE_MUTE_AUDIO":
        document.getElementById("local-mute-audio").click();
        break;
      case "REMOTE_MUTE_VIDEO":
        document.getElementById("local-mute-video").click();
        break;
    }
    // is a control message, don't capture in message history
    return;
  }

  messageHistory.push({
    peerID: peerId,
    username: participants[peerId].displayName,
    timestamp: Utils.Person.getLocalTime(),
    message: message
  });

  let view = document.importNode(messageTemplate.content, true);

  view.querySelector(".message-item-sender-icon").style.backgroundImage =
    "url(" + Utils.Video.captureFrame(peerId) + ")";
  view.querySelector(".message-item-sender-name").innerText =
    participants[peerId].displayName;
  view.querySelector(".message-item-timestamp").innerText =
    message.content.localTime;
  view.querySelector(".message-item-content").innerText =
    message.content.messageBody;
  messageContainer.appendChild(view);
  // scroll to bottom
  messageContainer.scrollTop = messageContainer.scrollHeight;
};

let incomingStream = function(
  peerId,
  stream,
  isSelf,
  peerInfo,
  isScreenSharing,
  streamId
) {
  //if (isSelf) {
  //let videoDOM = document.getElementById("vmask_" + peerId) || null;
  //if (videoDOM) videoDOM.parentNode.removeChild(videoDOM);
  //}

  //videos[peerId] =  new VideoElement(stream, isSelf, viewContainer, 500, 500, peerId, isScreenSharing );

  if (videos[peerId]) {
    delete videos[peerId];
    let videoDOM = document.getElementById("vmask_" + peerId);
    if (videoDOM) {
      videoDOM.parentElement.removeChild(videoDOM);
    }
  }

  videos[peerId] = isScreenSharing
    ? new VideoElement(
        stream,
        isSelf,
        viewContainer,
        viewContainer.clientWidth,
        600,
        peerId,
        isScreenSharing
      )
    : new VideoElement(
        stream,
        isSelf,
        viewContainer,
        300,
        300,
        peerId,
        isScreenSharing
      );

  if (window.innerWidth < 700) {
    setTimeout(Utils.Video.resizeToFit, 1200, 3);
  }

  participants[peerId].stream = stream;
  participants[peerId].status.audioMuted = peerInfo.mediaStatus.audioMuted;
  participants[peerId].status.videoMuted = peerInfo.mediaStatus.videoMuted;
  participants[peerId].status.screenSharing =
    peerInfo.settings.video.screenshare;
};

// Skylink Event Bindings
sl.on("mediaAccessSuccess", mediaSuccess);
sl.on("peerJoined", peerJoin);
sl.on("peerLeft", peerLeft);
sl.on("peerUpdated", peerUpdated);
sl.on("incomingMessage", incomingMessage);
sl.on("incomingStream", incomingStream);

let assignEvents = function() {
  document.getElementById("send-message-button").addEventListener(
    "click",
    function(event) {
      let messageBox = document.getElementById("outgoing-message");
      Utils.Messages.sendMessage(messageBox.value);
      messageBox.value = "";
    },
    false
  );

  document.getElementById("outgoing-message").addEventListener(
    "keyup",
    function(event) {
      if (event.key == "Enter") {
        console.log(event);
        Utils.Messages.sendMessage(event.target.value);
        event.target.value = "";
      }
    },
    false
  );

  window.addEventListener(
    "SETUP_REQUIRED",
    function() {
      Utils.DOM.clear();

      let view = document.importNode(welcomeTemplate.content, true);
      view.querySelector("#roomId").value = ConferenceCenter.roomID;
      view.querySelector("#roomPin").value = ConferenceCenter.PIN;
      viewContainer.appendChild(view);
      let steps = new StepView(document.getElementById("step-view"));
    },
    false
  );

  window.addEventListener(
    "SETUP_COMPLETE",
    function() {
      Utils.DOM.clear();

      sl.joinRoom(
        ConferenceCenter.preCallRoom,
        {
          audio: false,
          video: false
        },
        function(error, success) {
          let statusDisplay = document.getElementById("connectivity-status");
          if (error) statusDisplay.innerText = "ERROR";
          if (success) statusDisplay.innerText = " âœ…";
        }
      );

      let view = document.importNode(precallTemplate.content, true);
      let vSelect = view.querySelector("#video-selector");
      let aSelect = view.querySelector("#audio-selector");

      viewContainer.appendChild(view);

      navigator.getUserMedia(
        {
          audio: true,
          video: true
        },
        function(stream) {
          let videoTarget = document.getElementById("video-tester");
          if (window.innerWidth < 700) {
            videos["test"] = new VideoElement(
              stream,
              true,
              videoTarget,
              200,
              200,
              "test"
            );
          } else {
            videos["test"] = new VideoElement(
              stream,
              true,
              videoTarget,
              300,
              300,
              "test"
            );
          }
        },
        function(error) {
          if (error) console.log(error);
          return;
        }
      );

      viewContainer
        .querySelector("button")
        .addEventListener("click", function() {
          window.dispatchEvent(preCallCompleteEvent);
        });
    },
    false
  );

  window.addEventListener(
    "PRE_CALL_COMPLETE",
    function() {
      Utils.DOM.clear();
      delete videos["test"];
      viewContainer.classList.remove("precall");
      commandBar.classList.remove("precall");

      messageContainer.style.maxHeight =
        window.innerHeight - messageContainer.offsetTop - 150 + "px";

      sl.joinRoom(
        ConferenceCenter.roomID,
        {
          audio: true,
          video: true,
          userData: { username: ConferenceCenter.localDisplayName }
        },
        function(error, success) {
          if (error) {
            //error TODO
          }
          if (success) {
            Utils.Network.geoIPLookup();
            // keep checking location every 30 seconds
            //setInterval(Utils.Network.geoIPLookup, 30000);

            window.peerStatsChecker = setInterval(function() {
              for (let peer in participants) {
                if (Object.keys(participants).length > 1) {
                  sl.getConnectionStatus(participants[peer].peerId, function(
                    error,
                    success
                  ) {
                    if (error) {
                      return;
                    }
                    var target =
                      document.getElementById("part_" + peer) || null;
                    //console.log(target);
                    if (target && success.connectionStats[peer]) {
                      target.querySelector(".participant-stats").innerHTML =
                        "<strong>SEND: </strong> " +
                        " A: " +
                        Utils.Network.convert(
                          success.connectionStats[peer].audio.sending.bytes
                        ) +
                        " V: " +
                        Utils.Network.convert(
                          success.connectionStats[peer].video.sending.bytes
                        ) +
                        " <strong>RECV: </strong> " +
                        " A: " +
                        Utils.Network.convert(
                          success.connectionStats[peer].audio.receiving.bytes
                        ) +
                        " V: " +
                        Utils.Network.convert(
                          success.connectionStats[peer].video.receiving.bytes
                        );
                    } else {
                      target.querySelector(".participant-stats").innerHTML =
                        "Local User";
                    }
                  });
                }
              }
            }, 5000);
          }
        }
      );
    },
    false
  );

  window.addEventListener(
    "CALL_COMPLETE",
    function() {
      sl.leaveRoom(true, function(error, success) {
        Utils.DOM.clear();
        viewContainer.classList.add("precall");
        commandBar.classList.add("precall");
        if (success) {
          let view = document.importNode(postcallTemplate.content, true);
          viewContainer.appendChild(view);
        }
      });
    },
    false
  );

  //command center buttons
  document
    .getElementById("local-mute-audio")
    .addEventListener("click", function(event) {
      participants[
        ConferenceCenter.localPeerId
      ].status.audioMuted = !participants[ConferenceCenter.localPeerId].status
        .audioMuted;
      let muteConfig = {
        audioMuted:
          participants[ConferenceCenter.localPeerId].status.audioMuted,
        videoMuted: participants[ConferenceCenter.localPeerId].status.videoMuted
      };
      sl.muteStream(muteConfig);
      if (muteConfig.audioMuted) {
        event.target.classList.add("muted");
        event.target.innerHTML = "Unmute Audio";
      }
      if (!muteConfig.audioMuted) {
        event.target.classList.remove("muted");
        event.target.innerHTML = "Mute Audio";
      }
    });

  document
    .getElementById("local-mute-video")
    .addEventListener("click", function(event) {
      participants[
        ConferenceCenter.localPeerId
      ].status.videoMuted = !participants[ConferenceCenter.localPeerId].status
        .videoMuted;
      let muteConfig = {
        audioMuted:
          participants[ConferenceCenter.localPeerId].status.audioMuted,
        videoMuted: participants[ConferenceCenter.localPeerId].status.videoMuted
      };
      sl.muteStream(muteConfig);
      if (muteConfig.videoMuted) {
        event.target.classList.add("muted");
        event.target.innerHTML = "Disable Video";
      }
      if (!muteConfig.videoMuted) {
        event.target.classList.remove("muted");
        event.target.innerHTML = "Enable Video";
      }
    });

  document
    .getElementById("local-share-screen")
    .addEventListener("click", function(event) {
      sl.shareScreen({ audio: true });
      //TODO: Handle Stop Sharing
    });

  document
    .getElementById("local-disconnect")
    .addEventListener("click", function(event) {
      dispatchEvent(callCompleteEvent);
    });

  window.addEventListener(
    "touchstart",
    function(event) {
      gesture.a = event.changedTouches[0].screenX;
    },
    true
  );
  window.addEventListener(
    "touchend",
    function() {
      gesture.b = event.changedTouches[0].screenX;
      console.log(gesture.a - gesture.b);
      if (gesture.a > gesture.b && Math.abs(gesture.a - gesture.b) > 60)
        dispatchEvent(swipeLeftEvent);
      if (gesture.a < gesture.b && Math.abs(gesture.a - gesture.b) > 60)
        dispatchEvent(swipeRightEvent);
    },
    true
  );

  window.addEventListener("SWIPE_LEFT", function(event) {
    console.log("swiped left");
    commandBar.classList.add("expanded");
  });
  window.addEventListener("SWIPE_RIGHT", function(event) {
    console.log("swiped right");
    commandBar.classList.remove("expanded");
  });
};

//Classes
let App = class {
  constructor() {
    console.log("Fontumi Video v1.0.0");

    this.mcuKey = "c19eea58-c58c-4f90-80ff-62d72894a03f";
    this.p2pKey = "c19eea58-c58c-4f90-80ff-62d72894a03f";

    this.localDisplayName = null;
    this.localPeerId = null;

    this.preCallRoom =
      "PRECHECK" + new Date().getTime() + Math.random() * 100000;

    this.mcuEnabled = Boolean(
      new URLSearchParams(document.location.search).get("sfu")
    );

    this.roomID =
      new URLSearchParams(document.location.search).get("rid") || null;
    this.PIN = new URLSearchParams(document.location.search).get("pin") || null;
    this.hashedRoom = this.roomID; // TODO: SHHHH!

    this.apiKey = function() {
      return this.mcuEnabled ? this.mcuKey : this.p2pKey;
    };

    return this;
  }
};

let StepView = class {
  constructor(viewContainerElement) {
    console.log("Initializing Step View", viewContainerElement);

    this.steps = viewContainerElement.querySelectorAll(".step");
    this.progressDots = viewContainerElement.querySelectorAll(".step-dot");

    this.stepIndex = 0;

    this.incrementStep = function() {
      if (this.stepIndex === this.steps.length) {
        ConferenceCenter.localDisplayName = document.getElementById(
          "username"
        ).value;
        // TODO: Replace with pin hash
        ConferenceCenter.roomID = document.getElementById("roomId").value;

        dispatchEvent(setupCompletedEvent);
        return;
      }

      this.steps.forEach(function(elem) {
        elem.classList.add("hide");
      });
      this.steps[this.stepIndex].classList.remove("hide");
      this.progressDots.forEach(function(elem) {
        elem.classList.remove("active");
      });
      this.progressDots[this.stepIndex].classList.add("active");
      this.stepIndex++;
    };

    this.incrementStep(); // call it
    viewContainerElement._scope = this; // eww, but clock is ticking
    viewContainerElement.addEventListener("keyup", function(event) {
      if (event.key === "Enter") this._scope.incrementStep();
    });
    viewContainerElement.addEventListener(
      "click",
      function(event) {
        if (event.target.classList.contains("step-progress")) {
          //continue to next step
          this._scope.incrementStep();
        }
        event.stopPropagation();
      },
      false
    );
  }
};

let Person = class {
  constructor(displayName, isSelf) {
    this.displayName = displayName || "Anonymous Participant";
    this.videoDevice = "default";
    this.audioDevice = "default";
    this.stream = null;
    this.isSelf = isSelf;
    this.status = {
      videoMuted: false,
      audioMuted: false,
      screenSharing: false,
      activeSpeaker: false,
      location: "Unknown"
    };
  }
};

let VideoElement = class {
  constructor(
    stream,
    isSelf,
    targetContainer,
    width,
    height,
    peerId,
    isScreenSharing
  ) {
    this.screenSharing = isScreenSharing;

    //create video element mask
    let videoElementMask = document.createElement("div");
    videoElementMask.id = "vmask_" + peerId;
    videoElementMask.classList.add("video-mask");
    videoElementMask.classList.add("enter");

    // create video element
    let videoElement = document.createElement("video");
    videoElement.classList.add("masked-video");
    videoElement.id = peerId;
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    if (isSelf) videoElement.muted = true;
    if (isSelf) videoElement.setAttribute("muted", "muted");
    videoElement.showControls = true;
    if (isSelf && !isScreenSharing)
      videoElement.style.transform = "rotateY(180deg)";
    videoElement.srcObject = stream;
    videoElementMask.appendChild(videoElement);

    let audioMeterCanvas = document.createElement("canvas");
    audioMeterCanvas.classList.add("audio-meter");
    audioMeterCanvas.width = width;
    audioMeterCanvas.height = 20;
    videoElementMask.appendChild(audioMeterCanvas);

    let canvasContext = audioMeterCanvas.getContext("2d", { alpha: false });

    let resize = function(w, h) {
      videoElementMask.style.width = w + "px";
      videoElementMask.style.height = h + "px";
      videoElement.style.height = h - 20 + "px";
      audioMeterCanvas.width = w;
      audioMeterCanvas.height = 20;
    };

    //skip the audio meter on tracks with no audio (ie. screen share)
    //if (stream.getAudioTracks().length !== 0) {
    //let audioContext = new AudioContext();
    //let mediaStreamSource = audioContext.createMediaStreamSource(stream);
    //let audioMeter = createAudioMeter(audioContext, 0.98, 0.85);
    //let renderId = mediaStreamSource.connect(audioMeter);

    //let drawAudioMeter = function(time) {

    //canvasContext.fillStyle = "#000000";
    //canvasContext.fillRect(0, 5, width, 5);

    // temp disable
    //canvasContext.clearRect(0, 0, 3000, 10);

    //if (audioMeter.checkClipping()) canvasContext.fillStyle = "#ff3e54";
    //else canvasContext.fillStyle = "#00aaa4";
    //canvasContext.fillRect(0, 5, audioMeter.volume * width * 4, 5);
    //let i = 5;
    //while (i < videoElementMask.clientWidth) {
    //  canvasContext.fillStyle = "#000000";
    //  canvasContext.fillRect(i, 5, 2, 5);
    //  i = i + 7;
    //}
    //renderId = window.requestAnimationFrame(drawAudioMeter);
    // return;
    //};
    //drawAudioMeter();
    // }

    if (isScreenSharing) {
      videoElementMask.classList.add("screenshare");
      targetContainer.insertBefore(
        videoElementMask,
        targetContainer.firstChild
      );
    } else {
      targetContainer.appendChild(videoElementMask);
    }

    setTimeout(function() {
      videoElementMask.classList.remove("enter");
    }, 300);

    this.resize = resize;

    setTimeout(function() {
      if (!isScreenSharing) {
        resize(width, height);
      } else {
        resize(
          Math.round(viewContainer.clientWidth - 50),
          Math.round(((viewContainer.clientWidth - 50) / 16) * 10)
        );
        Utils.Video.resizeForScreenshare();
      }
    }, 2000);
    // LOL... stop it works.

    stream.getVideoTracks()[0].onended = function() {
      sl.stopScreen();
      setTimeout(function() {
        Utils.Video.resizeToFit(3);
      }, 2000);
    };

    return this;
  }
};

let Utils = class {};
Utils.Timedate = class {
  static convertToLongDay(day) {
    switch (day) {
      case "Sun":
        return "Sunday";
      case "Mon":
        return "Monday";
      case "Tue":
        return "Tuesday";
      case "Wed":
        return "Wednesday";
      case "Thu":
        return "Thursday";
      case "Fri":
        return "Friday";
      case "Sat":
        return "Saturday";
      default:
        return "Invalid Day";
    }
  }
};

Utils.Network = class {
  static query(url) {
    fetch(url).then(function(response) {
      if (response.status === 200) {
        response.json().then(function(data) {
          console.log("Geo IP  Lookup Result", data);
          Utils.Messages.sendAppMessage(data, "PEER_LOCATION_UPDATE");
        });
      }
    });
  }

  static geoIPLookup() {
    let accessKey = "8f8e08683e241924f7bfefffebafa0cf";
    let host = "https://api.ipstack.com/check";
    let requestURL = host + "&access_key=" + accessKey + "&format=1";
    return Utils.Network.query(requestURL);
  }

  static convert(bytes) {
    let bits = bytes * 8; // Convert to bits

    if (bits < 1000) {
      return bits + " bps";
    } else if (bits < 1000000) {
      return (bits / 1000).toFixed(2) + " kbps";
    } else {
      return (bits / 1000000).toFixed(2) + " mbps";
    }
  }
};

Utils.Person = class {
  static getLocalTime() {
    let date = new Date();
    return date.toString();
  }
};

Utils.MediaDevices = class {
  static async getDevices(filter) {
    // 'audio' or 'video'
    return await navigator.mediaDevices.enumerateDevices();
  }
};

Utils.Audio = class {
  static detectActiveSpeaker() {
    let activePeerId = null;
    return activePeerId();
  }
};

Utils.Video = class {
  static captureFrame(peerId) {
    let context = captureFrame.getContext("2d");
    context.drawImage(document.getElementById(peerId), 0, 0);
    return captureFrame.toDataURL();
  }
  static resizeAll(width, height) {
    console.log("Layout Event: Resize All");
    for (let video in videos) {
      videos[video].resize(width, height || width);
    }
  }
  static resizeToFit(cols) {
    console.log("Layout Event: Resize to Fit");
    let numVideos = Object.keys(videos).length;
    let rows = numVideos / cols;
    if (rows < 3) rows = 2;
    let size = (window.innerHeight - 100) / rows;
    console.log({ numVideos: numVideos, cols: cols, rows: rows, size: size });
    console.log("Resizing to fit with ResizeAll @ ", size);
    Utils.Video.resizeAll(size, size);
  }
  static resizeForActiveSpeaker(peerId) {
    console.log("Layout Event: Resize for Active Speaker");
    Utils.videoResizeAll(Object.keys(videos).length - 1);
    //TODO
  }
  static resizeForScreenshare() {
    console.log("Layout Event: Resize for Screenshare");
    let numVideos = Object.keys(videos).length;

    for (let video in videos) {
      if (!videos[video].screenSharing) {
        let size = viewContainer.clientWidth / numVideos;
        if (size > 150) size = 150;
        videos[video].resize(size, size);
      }
    }
  }
};

Utils.DOM = class {
  static clear() {
    while (viewContainer.childNodes.length) {
      viewContainer.firstChild.remove();
    }
  }
};

Utils.Messages = class {
  static sendMessage(message) {
    sl.sendMessage({
      messageBody: message,
      localTime: Utils.Person.getLocalTime()
    });
  }
  static sendAppMessage(content, action) {
    sl.sendMessage({
      action: action,
      content: content,
      localTime: Utils.Person.getLocalTime()
    });
  }
};

// App Event Handlers
let init = function() {
  console.log("init");
  ConferenceCenter = new App();
  console.log(ConferenceCenter);
  assignEvents();
  window.dispatchEvent(setupRequiredEvent);
  sl.init(ConferenceCenter.apiKey(), function(error, success) {
    console.log("Connecting to Skylink PaaS", error, success);
  });
};

document.addEventListener("DOMContentLoaded", function() {
  init();
});
