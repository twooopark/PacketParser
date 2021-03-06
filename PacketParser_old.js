var PORT = 22301;
var HOST = '0.0.0.0';
var dgram = require('dgram'); //UDP: Universal Datagram Protocol
var mysql = require('mysql');
var dateutil = require('date-utils'); //UNIX TIME PARSER

var con = mysql.createPool({
  host: "13.124.194.110", //no include port
  user: "dev",
  password: "xhdltmaltm",
  database: "smartschool",
  multipleStatements : true
});//http://opens.kr/83

var server = dgram.createSocket('udp4');//socket 생성, udp6은 UDP over IPv6을 의미udp4 는 UDP over IPv4

server.on('listening', function () {
	var address = server.address();
	console.log('UDP Server listening on ' + address.address + ":" + address.port);
});

process.on('uncaughtException', function (err) {
    console.log('Caught exception: ' + err);
 
});//[출처] node.js error가 발생해도 서버가 죽지않게하기.|작성자 큰돌

//Packet Send Data
server.on('message', function (message, remote) {

//console.log("--------------------------------------------------");
var Command = message.readUIntBE(0, 1);
var P_Mac = message.readUIntLE(1, 6);//모듈 맥
var t = message.readUInt32LE(7);//, 4);//시간 (date-utils 설치 해야함)
var dt;
if(t == 0 || t == 32400){ //time == 0 , 09:00
	dt = new Date();//Date.now().toString().substring(0,10); //현재 시간
}else{
	dt = new Date(t*1000);
}
var P_Time = dt.toFormat('YYYY-MM-DD HH24:MI:SS');
//console.log("Time : "+P_Time);
var P_Size = message.readUInt32LE(11);//, 4);//총 길이

var All_Length = 0; //이전 Packet길이 값을 사용하기 위해
	if(Command == 0x11){//SensorData
		//console.log('Sensor');
		var SN_Count = message.readUInt16LE(15);//, 2);
		for(var i = 0; i < SN_Count; i++){
			//SensorData
			var SN_Type = message.readUInt16LE(17 + All_Length);//, 2);
			var SN_Data = message.readInt32LE(19 + All_Length);//, 4);
			All_Length += 6;

			var sql = ""+
			// RAW DATA !!
			"INSERT INTO `smartschool`.`sensor_data` (`MAC`,`TYPE`,`DATA`,`TIME`) "+
			"VALUES ("+P_Mac+","+SN_Type+","+SN_Data+",'"+P_Time+"'); "+

			// Refined DATA
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
				//console.log("Sensor 1 record inserted");
			});
		}
		//console.log("Sensor's All items inserted!!!!");
	}//SENSOR END
	else if(Command == 0x14){//BluetoothData
		//console.log('Bluetooth');
		var BT_Count = message.readUIntLE(15, 2);
		for(i = 0; i < BT_Count; i++){
			//BLEData
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

			All_Length += (BLE_DataLength+15);// =1+1+1+6+1+BLE_DataLength+1+4

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
				//console.log("BLE inserted");
			});
		}
		//console.log("Bluetooth's All items inserted!!!!");
	}
	else{
		//console.log('Close Packet');
	}
});

server.bind(PORT, HOST);
//출처: http://opens.kr/61 [opens.kr]
//참조 node.js dgram Manual : http://nodejs.sideeffect.kr/docs/v0.8.20/api/dgram.html
