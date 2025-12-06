const express = require('express')
const cors = require('cors')
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

// midddleware
app.use(express.json());
app.use(cors());



app.get('/', (req, res) => {
  res.send('zem is shift!')
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.obmjqd4.mongodb.net/?appName=Cluster0`;

    const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
    });

    async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db('zem-shift-parcel');
    const parcelCollection = db.collection('parcel');




   // parcel API
  app.get('/parcel', async(req, res) =>{
    const query = {}

    const {email} = req.query;
    if(email){
        query.SenderEmail = email;
    }
    const options = {sort:{createdAt: -1}}

    const cursor = parcelCollection.find(query, options);
    const result = await cursor.toArray();
    res.send(result); 
  });

  app.get('/parcel/:id', async(req,res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await parcelCollection.findOne(query);
    res.send(result);
  });

  app.post('/parcel', async(req, res) =>{
    const parcel = req.body;
    parcel.createdAt = new Date();
    const result = await parcelCollection.insertOne(parcel);
    res.send(result);
  });

  
  const { ObjectId } = require('mongodb');
  app.delete('/parcel/:id', async (req, res) => {
    const id = req.params.id;
    const query = {_id: new ObjectId(id)};
    const result = await parcelCollection.deleteOne(query);
    res.send(result);
  })

  const YOUR_DOMAIN = process.env.DOMAIN_NAME;
//payment related API
app.post('/create-checkout-session', async (req, res) => {
  const { ParcelName, cost } = req.body;
const amount = parseInt(cost) * 100;
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: 'USD',
          unit_amount: amount,
          product_data: {
            name: ParcelName
          },
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${YOUR_DOMAIN}/dashboard/payment-success`,
    cancel_url: `${YOUR_DOMAIN}/dashboard/payment-cancel`,
  });
  console.log(session)
  res.send({ url: session.url })
});


  




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
   
  }
}
run().catch(console.dir);



app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
