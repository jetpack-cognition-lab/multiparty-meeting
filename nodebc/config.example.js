const os = require('os');

module.exports =
    {
	// mainurl: 'https://space.miniclub.space:3443',
	// youtubedlbin: '/usr/bin/youtube-dl',
	mainurl: 'https://soup.jetpack.cl:5443',
	youtubedlbin: '/usr/local/bin/youtube-dl',

	// Auth conf
	/*
	auth :
	{
		lti :
		{
			consumerKey    : 'key',
			consumerSecret : 'secret'
		},
		oidc:
		{
			// The issuer URL for OpenID Connect discovery
			// The OpenID Provider Configuration Document
			// could be discovered on:
			// issuerURL + '/.well-known/openid-configuration'

			issuerURL     : 'https://example.com',
			clientOptions :
			{
				client_id     : '',
				client_secret : '',
				scope       		: 'openid email profile',
				// where client.example.com is your multiparty meeting server
				redirect_uri  : 'https://client.example.com/auth/callback'
			}

		}
	},
	*/
	// redisOptions : {},
	// // session cookie secret
	// cookieSecret : 'T0P-S3cR3t_cook!e',
	// cookieName   : 'multiparty-meeting.sid',
}
