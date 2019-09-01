const express=require('express');
const bodyParser=require('body-parser');
const cors=require('cors');
const knex=require('knex');
const bcrypt = require('bcryptjs');
const crypto = require("crypto");
const fs = require('fs');
const nodemailer = require('nodemailer');

const check=(data)=>{
	if (data.split('').filter(x => x === '{').length >= 1) {
		return true
	}else{
		return false
	}
}


//connecting db to server with knex, heroku app
const db=knex({
	client:'pg',
	connection:{
		connectionString:process.env.DATABASE_URL,
		ssl: true		
	}
});


const app=express();
app.use(bodyParser.json());
app.use(cors());


//getting all the places from the db ordered by id
app.get('/',(req,res)=>{
	db.select('*').from('places').orderBy('m_place_id','desc')
	.then(places=>{
		res.json(places)
	})
})

app.post('/register',(req,res)=>{
	//getting email,name,password from FE	
	const {email,name,password}=req.body;
	//check if email,name... have a { to avoid bad codes -> securty.
		//if data received from FE are empty or contain { return error
	if(!email||	check(email) ||	!name||	check(name)|| !password||check(password)){
		return res.status(400).json('Incorrect form.')
	}else{
		//using bcrypt to encrypt user's password
		bcrypt.genSalt(10, function(err, salt) {
   		 bcrypt.hash(password, salt, function(err, hash) {
   		 	//using knex's transaction to work on multiple tables at the same time
        db.transaction(trx=>{
        	//inserting hashed password and email to the login table
		trx.insert({
			hash:hash,
			email:email
		})
		.into('login')
		.returning('email')
		.then(loginEmail=>{

		return trx('users')
			.returning('*')
			//inserting email,name,joined to the users table
			.insert({
				email:loginEmail[0],
				username:name,
				joined: new Date()
			})
			.then(user=>{
				//sending last user's info to the FE
				res.json(user[0])
			})
		})
		.then(trx.commit)
		.catch(trx.rollback)
	})
		.catch(err=>res.status(400).send(err))
		})
    });
	}
	
});

/*app.post('/createautoLogin',(req,res)=>{
	//getting email,password from FE
	const {email}=req.body;
	const token=crypto.randomBytes(10).toString('hex');
	
	bcrypt.genSalt(10, function(err, salt) {
   		 bcrypt.hash(token, salt, function(err, hash) {
   		 	db('users')			
			.where('email','=',email)										
			.update({
				autotoken:hash							
			})
			.returning(['email','m_user_id'])
			.then(data=>{
				res.json({email:data[0].email,id:data[0].m_user_id,token:token})
		  })
			.catch(err=>res.status(400).json('error'))	
		})
    })
})*/

app.post('/autoLogin',(req,res)=>{
	//getting email,token,id from FE
	const {id,token,email}=req.body;	
	db.select('m_user_id','autotoken','email').from('users')
		.where('m_user_id','=',id)
		.then(loginInfo=>{
			//comparing token if it's the right token we respond with user datas
			bcrypt.compare(token, loginInfo[0].autotoken, function(err, check) {
		//if there are no errors /check is true		 
			if(check) {
				//select users's data from users table where  email(users table) =  email(login table)
				return db.select('*').from('users')
				.where('email','=',loginInfo[0].email)				
				.then(user=>{
					//sending user's info to the FE (from the users table so there is no password sent)
					res.json({
						m_user_id:user[0].m_user_id,
						username:user[0].username,
						email:user[0].email,
						joined:user[0].joined,						
					})
				})
				.catch(err=>res.status(400).json('unable to connect'))
			}else {
				res.status(400).json('error')
			} 
		});		
	})
	
})

app.post('/login',(req,res)=>{
	//getting email,password from FE
	const {email,password}=req.body;
	const token=crypto.randomBytes(20).toString('hex');	
	//check if email,name... have a { to avoid bad codes -> securty. 
		//if data received from FE are empty or contain { return error
	if(!email||	check(email)||!password||check(password)){
		return res.status(400).json('Incorrect form.')
	}else{
		//selecting email,password from login's table where FE email= db email
		db.select('email','hash').from('login')
		.where('email','=',email)
		.then(loginInfo=>{
			//comparing the FE password with the crypted password in db
		bcrypt.compare(password, loginInfo[0].hash, function(err, check) {
		//if there are no errors /check is true		 
			if(check) {
				//select users's data from users table where  email(users table) =  email(login table)
				db.select('*').from('users')
				.where('email','=',loginInfo[0].email)
				//generating a hash for the token
				bcrypt.genSalt(10, function(err, salt) {
		   		 bcrypt.hash(token, salt, function(err, hash) {
		   		 	db('users')			
					.where('email','=',email)										
					.update({
						autotoken:hash							
					})
					.returning(['email','m_user_id','username','joined'])
					.then(data=>{
						res.json({
							email:data[0].email,
							id:data[0].m_user_id,
							token:token,
							username:data[0].username,
							joined:data[0].joined
						})
				  })
					.catch(err=>res.status(400).json('error'))	
				})
		    })
			}else {
				res.status(400).json('Wrong password or email.')
			} 
		});
	})
	.catch(err=>res.status(400).json('Wrong password or email.'))
	}	
})

app.post('/newplace',(req,res)=>{
	const {placename,country,description,image,latitude,longitude,user}=req.body;	
		db('places')
		.returning('*')
		//inserting new article's data to the db 
		.insert({
			image:image,		
			placename:placename,
			country:country,
			description:description,
			added:new Date(),
			latitude:latitude,
			longitude:longitude,
			user_id:user
		})
		.then(place=>{
			res.json(place[0])
		})
		.catch(err=> res.status(400).json({
			message:'Unable to add that place',
			error:err}))
	
})



app.delete('/deleteplace',(req,res)=>{
	const {id}=req.body;	 
	 	//delete 
	 	db.select('*').from('places')
	 	.where('m_place_id','=',id)
	 	.del()
		.returning('*')	
		.then(place=>{
					res.json(place[0])
				})
		.catch(err=>res.status(400).json('Article could not be deleted.'))		
	})



app.post('/forgot',(req,res)=>{	
	const {email}=req.body;
	if(!email||	check(email)){
		return res.status(400).json('Incorrect info.')
	}else{
	db.select('*').from('users')
	.where('email','=',email)
	.returning('*')		
	.then(user=>{		
		if(user[0]){
		//creating a token		
			const token=crypto.randomBytes(6).toString('hex');
			//setting expires time
			const expires=Number(Date.now())+ 3600000;					
				bcrypt.genSalt(10, function(err, salt) {
		   		 bcrypt.hash(token, salt, function(err, hash) {
		   		 	db('login')			
					.where('email','=',email)										
					.update({
						resetpasstoken:hash,
						resetpassexpires:expires						
					})
						.returning(['id','email'])
					.then(data=>{
						res.json(data[0])
						//sending a mail to the user				
						let transporter = nodemailer.createTransport({
							service: 'yahoo',		        
							auth: {
				            user: 'TestNodemailerYelcamp@yahoo.com', 
				            pass: `${process.env.email_pass} ` 
				        }
				    });	
						let mailOptions = {
				        from: 'TestNodemailerYelcamp@yahoo.com', // sender address
				        to: data[0].email, // list of receivers
				        subject: 'Hello', // Subject line
				        text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
				        'Here is the CODE:\n\n' +
				        token + '\n\n' +
				        'If you did not request this, please ignore this email and your password will remain unchanged.\n' // plain text body
				      };
				      transporter.sendMail(mailOptions, (error, info) => {
				      	if (error) {
				      		return console.log(error);
				      	}
				      	console.log('Message sent: %s', info.messageId);
				      	console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
				      });
				  })
					.catch(err=>res.status(400).json('error'))	
				})
		    })
			//sending token and expires to the db									
		}else{
			return res.json('Wrong email !')
		}
	})
	.catch(err=> res.status(400).json(err))
	}
});

app.post('/resetPass',(req,res)=>{
	const {token,email,password}=req.body;
	db.select('email','resetpasstoken','resetpassexpires').from('login')		
	.where('email','=',email)
	.returning('*')		
	.then(loginInfo=>{		
		bcrypt.compare(token, loginInfo[0].resetpasstoken, function(err, check) {
		//if there are no errors /check is true		 
			if(check) {
				//select users's data from users table where  email(users table) =  email(login table)
				
					// if token isnt expired reset the password (sending user's email to FE)
					if(Number(loginInfo[0].resetpassexpires)>Date.now()){
						if(!password){
							return res.status(400).json('Incorrect info.')
						}else{
							bcrypt.genSalt(10, function(err, salt){
							bcrypt.hash(password, salt, function(err, hash) {
							db.select('*').from('login')
							.where('email','=',email )
							.update({
							    resetpasstoken: null,
							    resetpassexpires: null,
							    hash: hash	      
							  	})
							  .returning(['email','id'])							  	
							.then(data=>{															
								res.json(data[0])
							})
							.catch(err=>res.status(400).json('Unable to reset your password.'))
								})
							})	
						}
				}else{
					res.json('Password reset token is invalid')
				}
						
			}else {
				res.status(400).json('Wrong code or email.')
			} 
		});
	})
	.catch(err=> res.status(400).json('Wrong email'))	
})




app.listen(process.env.PORT || 3001,()=>{console.log("app is running on port " + 3001)});