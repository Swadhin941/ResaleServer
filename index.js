const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;
const cors = require('cors');
require("dotenv").config();
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.SECRET_KEY);






app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.acejzkz.mongodb.net/?retryWrites=true&w=majority`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'Unauthorize request' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, function (error, decoded) {
    if (error) {
      return res.status(401).send({ message: "unauthorize request" });
    }
    req.decoded = decoded;
    next();
  });
}

const forbiddenCheck = (req, res, next) => {
  const email = req.query.user;
  const decodedEmail = req.decoded.email;
  if (email !== decodedEmail) {
    return res.status(403).send({ message: "Forbidden Access!" });
  }
  next();
}

async function run() {
  try {
    const user = client.db("CarResale").collection('user');
    const brands = client.db('CarResale').collection("Brands");
    const brandPost = client.db("CarResale").collection('BrandData');
    const bookingRequest = client.db("CarResale").collection("BookingData");
    const WishList = client.db("CarResale").collection('WishList');
    const verifyRequest = client.db('CarResale').collection('verifyRequest');
    const paymentCollection = client.db('CarResale').collection('payments');

    const verifySeller = async (req, res, next) => {
      const email = req.decoded.email;
      const result = await user.find({ email: email }).project({ role: 1 }).toArray();
      if (result[0].role === 'seller') {
        next();
      }
      else {
        return res.status(401).send({ message: "Unauthorize Access" });
      }
    }

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const result = await user.find({ email: email }).project({ role: 1 }).toArray();
      if(result[0].role=== 'admin'){
        next();
      }
      else{
        return res.status(401).send({message: "Unauthorize Access"});
      }
    }


    //Payment save to database;

    app.post('/payment', verifyJWT, async (req, res) => {
      const data = req.body;
      const query = { _id: new ObjectId(data.itemId) };
      let car = await brandPost.findOne(query);
      const updateDoc = {
        $set: {
          modelName: car.modelName,
          brandName: car.brandName,
          status: car.status,
          location: car.location,
          originalPrice: car.originalPrice,
          resalePrice: car.resalePrice,
          yearsOfUse: car.yearsOfUse,
          phoneNumber: car.phoneNumber,
          date: car.date,
          time: car.time,
          seller: car.seller,
          carImg: car.carImg,
          description: car.description,
          paymentStatus: true,
          advertise: false
        }
      };
      const option = { upsert: true };
      const brand = await brandPost.updateOne(query, updateDoc, option);
      const deleteBooking = await bookingRequest.deleteOne({ itemId: data.itemId });
      const result = await paymentCollection.insertOne(data);
      res.send(result);
    });

    app.post('/user', async (req, res) => {
      const data = req.body;
      const findQuery = { email: data.email };
      const userAvailability = await user.find(findQuery).toArray();
      let result;
      if (userAvailability.length === 0) {
        result = await user.insertOne({ email: data.email, role: data.role, name: data.fullName })
      }
      else {
        result = { acknowledged: true };
      }
      res.send(result);
    });
    app.put('/user', verifyJWT, forbiddenCheck, async (req, res) => {
      const query = { email: req.query.user };
      const updateDoc = {
        $set: {
          email: req.body.email,
          role: req.body.role,
          name: req.body.name,
          photoURL: req.body.photoURL
        }
      }
      const option = { upsert: true };
      const result = await user.updateOne(query, updateDoc, option);
      res.send(result);
    });
    app.get('/getUser', verifyJWT, async (req, res) => {
      const email = req.query.user;
      const result = await user.findOne({ email: email });
      res.send(result);
    });

    app.get('/verifyStatus', verifyJWT, verifySeller, forbiddenCheck, async (req, res) => {
      const email = req.query.user;
      const result = await verifyRequest.find({ email: email }).toArray();
      res.send(result);
    });

    app.delete('/verifyStatus', verifyJWT, verifySeller, forbiddenCheck, async (req, res) => {
      const email = req.body.email;
      const query = { email: { $eq: email } };
      const result = await verifyRequest.deleteOne(query);
      res.send(result);
    });

    app.post('/verifyRequest', verifyJWT, verifySeller, forbiddenCheck, async (req, res) => {
      const data = req.body;
      const result = await verifyRequest.insertOne({ email: data.email, verify: "requested" });
      res.send(result);
    });

    app.get('/brandName', verifyJWT, async (req, res) => {
      const result = await brands.find({}).project({ Brand: 1, _id: 0 }).toArray();
      res.send(result);
    })

    app.get('/bookingDetails/:id', verifyJWT, async (req, res) => {
      const query = { _id: new ObjectId(req.params.id) };
      const result = await bookingRequest.findOne(query);
      res.send(result);
    });


    app.post('/create-payment-intents', verifyJWT, async (req, res) => {
      const bookingData = req.body.bookingData;
      // console.log(bookingData);
      const price = bookingData.itemPrice * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: price,
        currency: 'usd',
        "payment_method_types": [
          "card"
        ]
      })
      // console.log(paymentIntent.client_secret);
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    app.get('/jwt', async (req, res) => {
      const email = req.query.user;
      const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: "1h" });
      res.send({ token });
    })
    app.get('/allCategory', async (req, res) => {
      const result = await brands.find({}).toArray();
      res.send(result);
    });

    app.get('/allCategories/:brandName', verifyJWT, async (req, res) => {
      const brandName = req.params.brandName;
      const result = await brandPost.find({ brandName: brandName }).toArray();
      res.send(result);
    });

    app.get('/details/:id', verifyJWT, async (req, res) => {
      let result = await brandPost.findOne({ _id: new ObjectId(req.params.id) });
      if (result) {
        const sellerName = await user.find({ email: result?.seller }).project({ name: 1, verified: 1 }).toArray();
        // console.log(sellerName);
        result.sellerName = sellerName[0].name;
        result.verified = sellerName[0]?.verified ? true : false;
        // console.log(result);
        return res.send(result);
      }
      else {
        return res.status(404).send({ message: "page not found" });
      }

    });

    app.post('/booking', verifyJWT, async (req, res) => {
      const data = req.body;
      const result = await bookingRequest.insertOne(data);
      res.send(result);
    });

    app.get("/bookingCheck", verifyJWT, async (req, res) => {
      const email = req.query.user;
      const item = req.query.item;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "Forbidden Access!" });
      }
      else {
        const query = { $and: [{ email: email }, { itemId: item }] }
        const result = await bookingRequest.findOne(query);
        return res.send({ booked: result ? true : false })
      }
    })

    app.get('/my-order', verifyJWT, async (req, res) => {
      const email = req.query.user;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "Forbidden Access!" });
      }
      else {
        let result = await bookingRequest.find({ email: email }).toArray();
        // console.log(result);
        const allProduct = await brandPost.find({}).toArray();
        // console.log(allProduct);
        // const data = allProduct.filter(item => item._id.toString()=== result[0].itemId);
        result.forEach(element => {
          const data = allProduct.filter(item => item._id.toString() === element.itemId);
          // console.log(data);
          element.paymentStatus = data[0]?.paymentStatus ? true : false;
        })
        // console.log("my order", result);
        return res.send(result);
      }
    });

    app.get('/my-products', verifyJWT, verifySeller, async (req, res) => {
      const email = req.query.user;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden Access!' });
      }
      else {
        const result = await brandPost.find({ seller: email }).toArray();
        return res.send(result);
      }
    });

    //Post a vehicle
    app.post('/brandUpload', verifyJWT, verifySeller, async (req, res) => {
      const email = req.query.user;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access!" });
      }
      else {
        const data = req.body;
        const result = await brandPost.insertOne(data);
        return res.send(result);
      }

    });
    app.put('/advertise', verifyJWT, verifySeller, async (req, res) => {
      const id = req.body._id;
      console.log(id);
      // const query= {_id: new ObjectId(req.body._id.toS)}
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          modelName: req.body.modelName,
          brandName: req.body.brandName,
          status: req.body.status,
          location: req.body.location,
          originalPrice: req.body.originalPrice,
          resalePrice: req.body.resalePrice,
          yearsOfUse: req.body.yearsOfUse,
          phoneNumber: req.body.phoneNumber,
          date: req.body.date,
          time: Date.now(),
          seller: req.body.seller,
          carImg: req.body.carImg,
          description: req.body.description,
          advertise: req.body.advertise
        }
      }
      const option = {
        upsert: true
      }
      const result = await brandPost.updateOne(query, updatedDoc, option);
      console.log(result);
      res.send(result);
    });

    app.get('/advertise', async (req, res) => {
      const result = await brandPost.find({ advertise: true }).project({ carImg: 1 }).toArray();

      res.send(result);
    });

    app.delete('/deleteBooking', verifyJWT, forbiddenCheck, async (req, res) => {
      const id = req.body.id;
      const email = req.query.user;
      const query = { $and: [{ itemId: { $eq: id } }, { email: { $eq: email } }] };
      const result = await bookingRequest.deleteOne(query);
      res.send(result);
    });

    app.delete("/deleteProduct", verifyJWT, verifySeller, forbiddenCheck, async (req, res) => {
      const email = req.query.user;
      const id = req.body.id;
      const query = { _id: new ObjectId(id) };
      const result = await brandPost.deleteOne(query);
      const bookingQuery = { itemId: id };
      const deleteBooking = await bookingRequest.deleteMany(bookingQuery);
      res.send(result);
    });

    app.get('/sellerCheck', async (req, res) => {
      const email = req.query.user;
      const result = await user.find({ email: email }).project({ role: 1, _id: 0 }).toArray();
      res.send({ isSeller: result[0].role === 'seller' });

    });

    //Admin routes

    app.get('/sellerList', verifyJWT, async (req, res) => {
      const email = req.query.user;
      let result = await user.find({ $and: [{ email: { $ne: email } }, { role: { $eq: "seller" } }] }).toArray();
      const verifyRequestCheck = await verifyRequest.find({}).toArray();
      result.forEach(element => {
        const data = verifyRequestCheck.filter(data => data.email === element.email);
        if (data.length > 0) {
          element.verifyRequest = true;
        }
      })
      res.send(result);
    });

    app.get('/buyerList', verifyJWT, forbiddenCheck, async (req, res) => {
      const email = req.query.user;
      const result = await user.find({ $and: [{ email: { $ne: email } }, { role: { $eq: "buyer" } }] }).toArray();
      res.send(result);
    });

    app.get('/userList', verifyJWT, forbiddenCheck, async (req, res) => {
      const email = req.query.user;
      const result = await user.find({ email: { $ne: email } }).toArray();
      res.send(result);
    });

    app.patch('/makeAdmin', verifyJWT, forbiddenCheck, async (req, res) => {
      const email = req.body.email;
      const result = await user.updateOne({ email: email }, { $set: { role: "admin" } }, { upsert: false });
      console.log(result);
      res.send(result);
    });

    app.patch('/removeAdmin', verifyJWT, forbiddenCheck, async (req, res) => {
      const email = req.body.email;
      const result = await user.updateOne({ email: email }, { $set: { role: req.body.role } }, { upsert: false });
      res.send(result);
    });

    app.get('/checkAdmin', async (req, res) => {
      const email = req.query.user;
      const result = await user.findOne({ email: email });
      res.send({ isAdmin: result.role === 'admin' });
    });

    app.delete('/deleteUser', verifyJWT, verifyAdmin,forbiddenCheck, async (req, res) => {
      const email = req.body.email;
      const result = await user.deleteOne({email: email});
      const wishDelete = await user.deleteMany({email: email});
      const bookingsDelete= await bookingRequest.deleteMany({email: email});
      const brandDelete= await brandPost.deleteMany({seller: email});
      const verifyRequestDelete = await verifyRequest.deleteOne({email: email});
      res.send(result);
    });

    app.put("/verifySeller", verifyJWT, verifyAdmin, forbiddenCheck, async(req, res)=>{
      const email = req.body.email;
      const getUserDetails = await user.findOne({email: email});
      const updatedDoc = {
        $set:{
          name: getUserDetails.name,
          email: req.body.email,
          role: getUserDetails.role,
          photoURL: getUserDetails?.photoURL,
          verified: true
        }
      };
      const option = {upsert: true};
      const deleteRequest = await verifyRequest.deleteOne({email: email});
      const result = await user.updateOne({email: email}, updatedDoc, option);
      res.send(result);
    });

  }
  finally {

  }
}
run()
  .catch(err => {
    console.log(err);
  })



app.listen(port, () => {
  console.log(`Listening on port : ${port}`);
})