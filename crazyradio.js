var Crazyradio = (function() {
  "use strict";
  var state = "closed";

  var usb = require('usb')

  var noop = function(state, data) {
    return;
  };

  // Generic helper function to implement the radio control transfer
  function controlTransfer(request, value, data, callback) {
    my.device.controlTransfer(usb.LIBUSB_REQUEST_TYPE_VENDOR, request, value,
                              0, data, function(error, data) {
      console.log(error);
      callback(true);
    });
  }

  // Public methods and states
  var my = {device: undefined, inep: undefined, outep: undefined};

  my.open = function(openedCb) {
    if (typeof(openedCb) !== "function") {
      openedCb = noop;
    }

    if (state !== "closed") {
      console.warn("Trying to re-open already openned radio, ignoring");
      openedCb(false);
      return;
    }

    var device = usb.findByIds(0x1915, 0x7777);

    if (device) {
      console.log("Oppening Crazyradio dongle");
      device.open();

      my.device = device;
      device.interface(0).claim();
      my.outep = device.interface(0).endpoint(0x01);
      my.inep = device.interface(0).endpoint(0x81);

      state = "opened";
      openedCb(true);
    } else {
      console.error("Cannot find Crazyradio dongle!");
      openedCb(false);
    }
  };

  my.checkDevice = function() {
    var device = usb.findByIds(0x1915, 0x7777);
    if (device != undefined) {
      return true;
    } else {
      return false;
    }
  }

  my.sendPacket = function(buffer, packetSendCb) {
    my.outep.transfer(buffer, function(error) {
      console.log(error);
      my.inep.transfer(64, function(error, data){
        var ack = new Uint8Array(data);

        packetSendCb(ack[0]!==0, ack.subarray(1).buffer);
      });
    });
  };

  my.setChannel = function(channel, callback) {
    channel = Number(channel);

    if ((channel<0) || (channel>125)) {
      callback(false);
      my.error = "Error: cannot set a channel outside of [0 125]";
    }

    controlTransfer(0x01, channel, Buffer(0), callback);
  };

  my.setDatarate = function(datarate_str, callback) {
    var datarate;
    if (datarate_str === "250Kbps") datarate = 0;
    else if (datarate_str === "1Mbps") datarate = 1;
    else if (datarate_str === "2Mbps") datarate = 2;
    else {
      my.error = "Error: Wrong value, not a datarate: " + datarate_str;
      callback(false);
      console.error(my.error);
      return;
    }

    controlTransfer(0x03, datarate, Buffer(0), callback);
  };

  my.scanChannels = function(start, stop, scanCb) {
    var channel = start;
    var channels = [];
    var cb1 = function(ack, data) {
      //console.log("in cb1")
      // Check the ack
      if (ack) {
        channels.push(channel);
      }
      channel++;
      if (channel <= stop) {
        //set channel with callback cb2
        my.setChannel(channel, cb2);
      } else {
        // call scanCb with table of found channel
        scanCb(channels);
      }
    };
    var cb2 = function() {
      //console.log("in cb2")
      // send null packet with callback cb1
      var pingPacket = new ArrayBuffer(1);
      var pingdv = new DataView(pingPacket);
      // pingdv.getUint8(0, true)
      pingdv.setUint8(0, 0xff, true);
      my.sendPacket(pingPacket, cb1);
    }
    //set channel with callback cb2
    my.setChannel(channel, cb2);
  };

  my.close = function() {
    if (state !== "opened") {
      return;
    }

    state = "closed";

    my.device.close();
  };

  my.packetSent = noop;

  return my;
}());
