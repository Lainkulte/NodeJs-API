var express = require('express');
var config  = require('./config.js');
var jwt 	= require('jsonwebtoken');

var router = express.Router();
var Sequelize = require('sequelize');

module.exports = (function() {

	//Initialize database
	var sequelize = new Sequelize(config.database, config.username, config.password);
	var TABLE_PREFIX = config.table_prefix;

	//Pagination settings
	var paginate = config.paginate;
	var page_limit = config.page_limit;

	var mysql_clean = function (string) {
		return sequelize.getQueryInterface().escape(string);
	};

	// route to authenticate a user (POST ~/api/authenticate)
	router.post('/auth/', function(req, res) {

		// find the user
		var read_query = "SELECT * FROM `users` WHERE Users_mail=" + mysql_clean(req.body.user_email) + " AND Users_mdp=" + mysql_clean(req.body.password);

		sequelize.query(read_query, { type: sequelize.QueryTypes.SELECT})
		.then(function(row) {

			if (row > 1 || row < 1) {
				res.json({ success: false, message: 'a wild error appear' });
			} else {
		
			if (!res) {
				res.json({ success: false, message: 'no response.' });
			} else {
		
					// if user is found and password is right
					// create a token with only our given payload
				// we don't want to pass in the entire user since that has the password
				var payload =  { data: 'test' };
				var token = jwt.sign(payload, config.secret, {
					expiresIn: '24h' // expires in 24 hours
				});
	  
				// return the information including token as JSON
				res.json({
						success: true,
						message: 'Enjoy your token!',

						token: token
					})
			} 
		  }

		})
	  })

	
	  // CHECK IF THE USER HAVE THE TOKEN
	  router.use( (req, res, next) => {

		// check header or url parameters or post parameters for token
		var token = req.body.token || req.headers['x-access-token'];
	  
		// decode token
		if (token) {
	  
		  // verifies secret and checks exp
		  jwt.verify(token, config.secret, (err, decoded) => {       
			  	if (err) {
					return res.json({ success: false, message: 'Failed to authenticate token.' });       
				} else {
				// if everything is good, save to request for use in other routes
				req.decoded = decoded;         
				next();
				}
			});

		} else {
	  
		  // if there is no token
		  // return an error
		  return res.status(403).send({ 
			  success: false, 
			  message: 'No token provided.' 
		  });
		}

	  });
	

	//Create 
	router.post('/:table', function(req, res) {
		if(JSON.stringify(req.body) == '{}') {
			res.status(404);
			res.json({
				"success" : 0,
				"message" : "Parameters missing"
			});
			return false;
		}
		var keys = '';
		var values = '';
		Object.keys(req.body).forEach(function(key, index) {
			var val = req.body[key];
			keys += "`"+key+"`";
			values += mysql_clean(val);
			if(Object.keys(req.body).length != (index+1)) {
				keys += ',';
				values += ',';
			}
		});
		sequelize.query("INSERT INTO `" + ( TABLE_PREFIX + req.params.table ) + "` (" + keys + ") VALUES ("+ values +")", { type: sequelize.QueryTypes.INSERT})
		.then(function(id) {
			res.status(201);
			res.json({
				"success" : 1,
				"id" : id
			});
		})
		.catch( function(err) {
			res.status(404);
			res.send({
				"success" : 0,
				"message" : err.message
			});
		});
	});

	//Update by ID 
	router.put('/:table/:id', function(req, res) {
		sequelize.query("SHOW KEYS FROM `" + ( TABLE_PREFIX + req.params.table ) + "` WHERE Key_name = 'PRIMARY'", { type: sequelize.QueryTypes.SELECT})
		.then(function(keys) {
			var primary_key = keys[0].Column_name;
			if(JSON.stringify(req.body) == '{}') {
				res.status(200);
				res.json({
					"success" : 0,
					"message" : "Parameters missing"
				});
				return false;
			}
			var update_string = '';
			Object.keys(req.body).forEach(function(key, index) {
				var val = req.body[key];
				update_string += "`" + key + "` = " + mysql_clean(val); 
				if(Object.keys(req.body).length != (index+1)) {
					update_string += ',';
				}
			});
			sequelize.query("UPDATE `" + ( TABLE_PREFIX + req.params.table ) + "` SET " + update_string + " WHERE `" + primary_key +"` = " + mysql_clean(req.params.id), { type: sequelize.QueryTypes.UPDATE })
			.then(function() {
				res.status(200);
				res.json({
					"success" : 1,
					"message" : "Updated"
				});
			})
			.catch( function(err) {
				res.status(404);
				res.send({
					"success" : 0,
					"message" : err.message
				});
			});
		})
		.catch( function(err) {
			res.status(404);
			res.send({
				"success" : 0,
				"message" : err.message
			});
		});
	});

	//Read 
	router.get('/:table', function(req, res) {
		if(paginate) {
			var page = 1;
			if(req.query.page)
				page = req.query.page;
			var offset = (page-1) * page_limit;

			//Calculate pages
			var next = Number(page)+1;
			if(page != 1)
				var previous = Number(page)-1;
			else
				var previous = Number(page);

			var read_query = "SELECT * FROM `" + ( TABLE_PREFIX + req.params.table ) + "` LIMIT "+page_limit+" OFFSET "+offset;
		} else {
			var read_query = "SELECT * FROM `" + ( TABLE_PREFIX + req.params.table ) + "`";
		}
		sequelize.query(read_query, { type: sequelize.QueryTypes.SELECT})
		.then(function(rows) {
			if(!rows.length) {
				res.status(404);
				res.json({
					"success" : 0,
					"data" : "No rows found"
				});
			}
			res.status(200);
			if(!next)
				res.json({
					"success" : 1,
					"data" : rows
				});
			else
				var last = Math.ceil(rows.length/page_limit);
			res.json({
				"success" : 1,
				"data" : rows,
				"pages" : {
					"next": next,
					"previous": previous,
					"last": last
				}
			});
		})
		.catch( function(err) {
			res.status(404);
			res.send({
				"success" : 0,
				"message" : err.message
			});
		});
	});

	//Get with filter
	router.get('/:table/filter/:column=:value', function(req, res) {
		var read_query = "SELECT * FROM `" + ( TABLE_PREFIX + req.params.table ) + "` WHERE `" + (req.params.column) + "` = " + mysql_clean(req.params.value) ;
		sequelize.query(read_query, { type: sequelize.QueryTypes.SELECT})
		.then(function(rows) {
			if(!rows.length) {
				res.status(404);
				res.json({
					"success" : 0,
					"data" : "No rows found"
				});
			}
			res.status(200);
			res.json({
				"success" : 1,
				"data" : rows
			});
		})
		.catch( function(err) {
			res.status(404);
			res.send({
				"success" : 0,
				"message" : err.message
			});
		});
	});


	//Read by ID 
	router.get('/:table/:id', function(req, res) {
		sequelize.query("SHOW KEYS FROM `"+TABLE_PREFIX+req.params.table+"` WHERE Key_name = 'PRIMARY'", { type: sequelize.QueryTypes.SELECT})
		.then(function(keys) {
			var primary_key = keys[0].Column_name;
			sequelize.query("SELECT * FROM `"+TABLE_PREFIX+req.params.table+"` WHERE `"+ primary_key +"` = " + mysql_clean(req.params.id), { type: sequelize.QueryTypes.SELECT})
			.then(function(rows) {
				if(!rows.length) {
					res.status(404);
					res.json({
						"success" : 0,
						"data" : "No rows found"
					});
				}
				res.status(200);
				res.json({
					"success" : 1,
					"data" : rows
				});
			})
			.catch( function(err) {
				res.status(404);
				res.send({
					"success" : 0,
					"message" : err.message
				});
			});
		})
		.catch( function(err) {
			res.status(404);
			res.send({
				"success" : 0,
				"message" : err.message
			});
		});
	});

	//Delete by ID 
	router.delete('/:table/:id', function(req, res) {
		sequelize.query("SHOW KEYS FROM `"+TABLE_PREFIX+req.params.table+"` WHERE Key_name = 'PRIMARY'", { type: sequelize.QueryTypes.SELECT})
		.then(function(keys) {
			var primary_key = keys[0].Column_name;
			sequelize.query("DELETE FROM `"+TABLE_PREFIX+req.params.table+"` WHERE `"+ primary_key +"` = "+mysql_clean(req.params.id), { type: sequelize.QueryTypes.DELETE})
			.then(function() {
				res.status(200);
				res.json({
					"success": 1,
					"message": "Deleted"
				});
			})
			.catch( function(err) {
				res.status(404);
				res.send({
					"success" : 0,
					"message" : err.message
				});
			});
		})
		.catch( function(err) {
			res.status(404);
			res.send({
				"success" : 0,
				"message" : err.message
			});
		});
	});

	return router;

})();