(function () {
  "use strict";

  var radioState = "disconnected";
  var usedGamepad;
  var lastTime = Date.now();
  var prev_thrust;

  window.onload = function() {
    if (Crazyradio.checkDevice() === false) {
      console.log("Cannot find Crazyradio")
      $("#connectButton").text("Cannot find Crazyradio");
    }
    document.querySelector('#connectButton').onclick = function() {

      if (radioState === "disconnected") {
        Crazyradio.open(function(state) {
          console.log("Crazyradio opened: " + state);
          if (state === true) {
            Crazyradio.setChannel($("#channel").val(), function(state) {
              Crazyradio.setDatarate($("#datarate").val(), function(state) {
                if (state) {
                  $("#connectButton").text("Disconnect");
                  $("#packetLed").addClass("connected");

                  radioState = "connected";
                  $('#channel').prop('disabled', true);
                  $('#datarate').prop('disabled', true);
                }
              });
            });
          }
        });
      } else if (radioState === "connected") {
        radioState = "disconnected";
        Crazyradio.close();

        $("#connectButton").text("Connect Crazyflie");
        $("#packetLed").removeClass("connected");

        $('#channel').prop('disabled', false);
        $('#datarate').prop('disabled', false);
      }
    };

    window.setInterval(sendSetpoint, 30);
  };

  function sendSetpoint() {

    var gamepads = navigator.getGamepads();

    var usb = require('usb')

    // Selecting gamepad
    if (usedGamepad === undefined) {
      _(gamepads).each(function (g) {
        if (g) {
          if (g.buttons[0].pressed) {
            usedGamepad = g.index;

            $("#gamepadText").text("Using: " + g.id);
          }
        }
      });
    }

    if (radioState !== "connected") return;

    var pitch = 0,
        roll  = 0,
        yaw   = 0,
        thrust = 0,
        limited_thrust = 0,
        thrust_slew_rate = 10,
        slew_limit = 0,
        minThrust = 0,
        maxThrust = 0,
        lowering = 0,
        first = true,
        oldAxe1 = 0;


    //Getting controller scheme
    var scheme = $('#controlScheme')[0].value;
    //var scheme = 'default';

    // Getting values from gamepad
    if (usedGamepad !== undefined) {
      var axe1 = gamepads[usedGamepad].axes[1]
      if (scheme === 'default') {
        roll = gamepads[usedGamepad].axes[0] * 30;
        pitch = gamepads[usedGamepad].axes[1] * 30;
        yaw = gamepads[usedGamepad].axes[2] * 200;
        thrust = gamepads[usedGamepad].axes[3] * -55000;
        if (thrust < 500) thrust = 0;
      } else if (scheme === 'experimental') {
        // thrust
        lowering = ((Date.now() - lastTime) * thrust_slew_rate);
        //console.log(Date.now() - lastTime)
        minThrust = 16000;
        slew_limit = 28800;
        maxThrust = 51000;
        thrust = axe1 * -64000;
        limited_thrust = thrust;
        //console.log(Date.now() - lastTime)
        //console.log("Thrust: " + limited_thrust + ", Previous Thrust: " + prev_thrust)
        if (prev_thrust > limited_thrust && limited_thrust > 0) {
          console.log('Descending')
          if (thrust > slew_limit) {
            console.log('No slew yet')
            limited_thrust = thrust;
          } else {
            console.log('Slew required')
            if (prev_thrust > slew_limit) {
              limited_thrust = slew_limit;
              console.log('Starting slew' + limited_thrust)
            } else {
              limited_thrust = prev_thrust - lowering;
              console.log('Lowering slew: ' + limited_thrust)
            }
          }
        } else if (thrust < minThrust) {
          prev_thrust = 0;
          limited_thrust = 0;
        }
        yaw = gamepads[usedGamepad].axes[0] * 200;
        roll = gamepads[usedGamepad].axes[2] * 30;
        pitch = gamepads[usedGamepad].axes[3] * 30;
        if (gamepads[usedGamepad].buttons[12].pressed) {
          limited_thrust = 32568;
        }
        if (limited_thrust > maxThrust) {
          limited_thrust = maxThrust;
        }
        prev_thrust = limited_thrust;
        if (limited_thrust < minThrust) {
          prev_thrust = 0;
          limited_thrust = 0;
        }
        thrust = limited_thrust;
        if (yaw < 5 && yaw > -5) {
          yaw = 0;
        }
        if (roll < 2 && roll > -2) {
          roll = 0;
        }
        if (pitch < 2 && pitch > -2) {
          pitch = 0;
        }
      }
      lastTime = Date.now();
      $("#thrustMeter").text("Thrust: " + Math.floor(thrust / 640) + "% (" + thrust + ")");
      $("#yawMeter").text("Yaw: " + yaw);
      $("#rollMeter").text("Roll: " + roll);
      $("#pitchMeter").text("Pitch: " + pitch);
    }

    //Preparing commander packet
    var packet = new ArrayBuffer(15);
    var dv = new DataView(packet);

    dv.setUint8(0, 0x30, true);      // CRTP header
    dv.setFloat32(1, roll, true);    // Roll
    dv.setFloat32(5, pitch, true);   // Pitch
    dv.setFloat32(9, yaw, true);     // Yaw
    dv.setUint16(13, thrust, true);  // Thrust

    Crazyradio.sendPacket(packet, function(state, data) {
      if (state === true) {
        $("#packetLed").addClass("good");
      } else {
        $("#packetLed").removeClass("good");
      }
    });
  }

}())
