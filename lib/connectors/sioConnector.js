const EventEmitter = require('events').EventEmitter;
const httpServer = require('http').createServer();
const SioSocket = require('./sio/sioSocket');

const PKG_ID_BYTES = 4;
const PKG_ROUTE_LENGTH_BYTES = 1;
const PKG_HEAD_BYTES = PKG_ID_BYTES + PKG_ROUTE_LENGTH_BYTES;

let curId = 1;

/**
 * Connector that manager low level connection and protocol bewteen server and client.
 * Develper can provide their own connector to switch the low level prototol, such as tcp or probuf.
 */
class SioConnector extends EventEmitter
{
	constructor(port, host, opts)
    {
		super();
		this.port = port;
		this.host = host;
		this.opts = opts;
		this.heartbeats = opts.heartbeats || true;
		this.closeTimeout = opts.closeTimeout || 60;
		this.heartbeatTimeout = opts.heartbeatTimeout || 60;
		this.heartbeatInterval = opts.heartbeatInterval || 25;
	}

    /**
     * Start connector to listen the specified port
     */
	start(cb)
    {
        // issue https://github.com/NetEase/pomelo-cn/issues/174
		if (this.opts)
        {
			this.wsocket = sio.listen(this.port, this.opts);
		}
		else
        {
            // 'websocket', 'htmlfile', 'xhr-polling', 'jsonp-polling', 'flashsocket'
			this.wsocket = sio.listen(this.port, {
				transports : [
					'websocket', 'polling'
				]
			});
		}
		let opts = {};
		if (this.opts)
		{
			opts = this.opts;
		}
		else
		{
			opts = {
				transports : ['websocket', 'polling-xhr', 'polling-jsonp', 'polling']
			};
		}

		const sio = require('socket.io')(httpServer, opts);

		const port = this.port;
		httpServer.listen(port, () =>
		{
			console.log('sio Server listening at port %d', port);
		});
		sio.set('path', '/socket.io');
		// sio.set('transports', this.opts.transports);
		sio.set('close timeout', this.closeTimeout);
		// sio.set('heartbeat timeout', this.heartbeatTimeout);
		// sio.set('heartbeat interval', this.heartbeatInterval);
		// sio.set('heartbeats', this.heartbeats);
		// sio.set('log level', 1);

		sio.set('resource', '/socket.io');
		sio.set('transports', this.opts.transports);
		sio.set('heartbeat timeout', this.heartbeatTimeout);
		sio.set('heartbeat interval', this.heartbeatInterval);

		sio.on('connection', socket =>
		{
			// this.wsocket.sockets.on('connection', function (socket) {
			const sioSocket = new SioSocket(curId++, socket);
			this.emit('connection', sioSocket);
			sioSocket.on('closing', reason =>
			{
				sioSocket.send({
					route  : 'onKick',
					reason : reason});
			});
		});
		process.nextTick(cb);
	}

    /**
     * Stop connector
     */
	stop(force, cb)
    {
		httpServer.close();
		process.nextTick(cb);
	}
}

class SioConnectorUtility
{
	static EnCode(reqId, route, msg)
    {
		if (reqId)
        {
			return SioConnectorUtility.composeResponse(reqId, route, msg);
		}
		return SioConnectorUtility.composePush(route, msg);
	}

    /**
     * Decode client message package.
     *
     * Package format:
     *   message id: 4bytes big-endian integer
     *   route length: 1byte
     *   route: route length bytes
     *   body: the rest bytes
     *
     * @param  {String} msg socket.io package from client
     * @return {Object}      message object
     */
	static DeCode(msg)
    {
		let index = 0;

		const id = SioConnectorUtility.parseIntField(msg, index, PKG_ID_BYTES);
		index += PKG_ID_BYTES;

		const routeLen = SioConnectorUtility.parseIntField(msg, index, PKG_ROUTE_LENGTH_BYTES);

		const route = msg.substr(PKG_HEAD_BYTES, routeLen);
		const body = msg.substr(PKG_HEAD_BYTES + routeLen);

		return {
			id    : id,
			route : route,
			body  : JSON.parse(body)
		};
	}

	static composeResponse(msgId, route, msgBody)
    {
		return {
			id   : msgId,
			body : msgBody
		};
	}

	static composePush(route, msgBody)
    {
		return JSON.stringify({
			route : route,
			body  : msgBody});
	}

	static parseIntField(str, offset, len)
    {
		let res = 0;
		for (let i = 0; i < len; i++)
        {
			if (i > 0)
            {
				res <<= 8;
			}
			res |= str.charCodeAt(offset + i) & 0xff;
		}
		return res;
	}
}

SioConnector.encode = SioConnector.prototype.encode = SioConnectorUtility.EnCode;
SioConnector.decode = SioConnector.prototype.decode = SioConnectorUtility.DeCode;

module.exports = function(port, host, opts)
{
	if (!(this instanceof SioConnector))
	{
		return new SioConnector(port, host, opts);
	}
};