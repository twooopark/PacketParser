var PORT 		= 22301,
	HOST 		= '0.0.0.0';
var dgram 		= require('dgram'), //UDP: Universal Datagram Protocol
	mysql 		= require('mysql'),
    //con        	= require("./db"),
	dateutil 	= require('date-utils'); //UNIX TIME PARSER


var server = dgram.createSocket('udp4');

server.on('listening', function () {
	var address = server.address();
	console.log('UDP Server listening on ' + address.address + ":" + address.port);
});

process.on('uncaughtException', function (err) {
    console.log('Caught exception: ' + err);
 
});

server.on('message', function (message, remote) {

var Command = message.readUIntBE(0, 1);
var P_Mac = message.readUIntLE(1, 6);
var t = message.readUInt32LE(7);
var dt;
if(t == 0 || t == 32400){ 
	dt = new Date();
}else{
	dt = new Date(t*1000);
}
var P_Time = dt.toFormat('YYYY-MM-DD HH24:MI:SS');
var P_Size = message.readUInt32LE(11);

var All_Length = 0; 
	if(Command == 0x11){//SensorData
		var SN_Count = message.readUInt16LE(15);//, 2);
		for(var i = 0; i < SN_Count; i++){
			//SensorData
			var SN_Type = message.readUInt16LE(17 + All_Length);//, 2);
			if(SN_Type == 5 || SN_Type == 6) break;
			var SN_Data = message.readInt32LE(19 + All_Length);//, 4);
			All_Length += 6;

			var sql = ""+
			"INSERT INTO `smartschool`.`sensor_data` (`MAC`,`TYPE`,`DATA`,`TIME`) "+
			"SELECT "+P_Mac+","+SN_Type+","+SN_Data+",'"+P_Time+"' FROM DUAL "+
			"WHERE EXISTS( "+
				"SELECT `sensor`.`TYPE`, `sensor`.`MIN`, `sensor`.`MAX` "+
				"FROM `smartschool`.`sensor` "+
				"WHERE `sensor`.`TYPE` = "+SN_Type+" and (MIN < "+SN_Data+" and MAX > "+SN_Data+")) "+
			"ON DUPLICATE KEY UPDATE `DATA` ="+SN_Data+",`TIME` ='"+P_Time+"'; "+

			"INSERT INTO `smartschool`.`sensor_data_update` (`MAC`,`TYPE`,`DATA`,`TIME`) "+
			"SELECT "+P_Mac+","+SN_Type+","+SN_Data+",'"+P_Time+"' FROM DUAL "+
			"WHERE EXISTS( "+
				"SELECT `sensor`.`TYPE`, `sensor`.`MIN`, `sensor`.`MAX` "+
				"FROM `smartschool`.`sensor` "+
				"WHERE `sensor`.`TYPE` = "+SN_Type+" and (MIN < "+SN_Data+" and MAX > "+SN_Data+")) "+
			"ON DUPLICATE KEY UPDATE `DATA` ="+SN_Data+",`TIME` ='"+P_Time+"'; "+
			
			// out of range
			"INSERT INTO `smartschool`.`sensor_error` (`MAC`,`TYPE`,`DATA`,`TIME`) "+
			"SELECT "+P_Mac+","+SN_Type+","+SN_Data+",'"+P_Time+"' FROM DUAL "+
			"WHERE EXISTS( "+
				"SELECT `sensor`.`TYPE`, `sensor`.`MIN`, `sensor`.`MAX` "+
				"FROM `smartschool`.`sensor` "+
				"WHERE `sensor`.`TYPE` = "+SN_Type+" and (MIN > "+SN_Data+" or MAX < "+SN_Data+")) "+
			"ON DUPLICATE KEY UPDATE `DATA` ="+SN_Data+",`TIME` ='"+P_Time+"'; ";

			con.query(sql, function (err, result) {
				if (err) throw err;
			});
		}
	}//SENSOR END
	else if(Command == 0x14){//BluetoothData
		var BT_Count = message.readUIntLE(15, 2);
		for(i = 0; i < BT_Count; i++){
			if(message.readIntLE(17 + All_Length, 1) == 0xd){
			}else break;
			var BLE_Length = message.readUIntLE(18 + All_Length, 1);
			var BLE_Rssi = message.readUIntLE(19 + All_Length, 1);
			var BLE_Mac = message.readUIntLE(20 + All_Length, 6);
			var BLE_DataLength = message.readUIntLE(26 + All_Length, 1);
			if((BLE_Length-8)==BLE_DataLength){
			}else break;
			if(message.readIntLE(27 + All_Length + BLE_DataLength, 1) == 0xe){
			}else break;
			var BLE_Data = message.readUIntLE(27 + All_Length, BLE_DataLength);
	
	        var BLE_t = message.readUIntLE(28 + All_Length + BLE_DataLength, 4);
	        var BLE_dt = new Date(BLE_t*1000);
   			var BLE_Time = BLE_dt.toFormat('YYYY-MM-DD HH24:MI:SS');

			All_Length += (BLE_DataLength+15);

			var BLE = {
				'CLASSROOM_MAC' : P_Mac,
				'TIME': P_Time,
				'RSSI': BLE_Rssi,
				'BLE_MAC': BLE_Mac,
				'BLE_Time': BLE_Time,
				'DATA': BLE_Data
			};
			con.query('INSERT INTO RAW_BLE SET ?', BLE, function(err, result) {
				if (err) throw err;
			});
		}
	}
	else{
	}
});

server.bind(PORT, HOST);
