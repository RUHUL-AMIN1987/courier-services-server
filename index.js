// FIXED FULL server.js CODE
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;

const crypto = require('crypto');
function generateTrackingId(prefix = "ZEM") {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${date}-${random}`;
}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
  res.send('zem is shift!');
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.obmjqd4.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db('zem-shift-parcel');
    const parcelCollection = db.collection('parcel');
    const paymentCollection = db.collection('payments');

    // ---------------- PARCEL API ----------------
    app.get('/parcel', async (req, res) => {
      const query = {};
      const { email } = req.query;
      if (email) query.SenderEmail = email;
      const options = { sort: { createdAt: -1 } };
      const result = await parcelCollection.find(query, options).toArray();
      res.send(result);
    });

    app.get('/parcel/:id', async (req, res) => {
      const id = req.params.id;
      const result = await parcelCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.post('/parcel', async (req, res) => {
      const parcel = req.body;
      parcel.createdAt = new Date();
      parcel.paymentStatus = "unpaid";
      parcel.trackingId = null;
      const result = await parcelCollection.insertOne(parcel);
      res.send(result);
    });

    app.delete('/parcel/:id', async (req, res) => {
      const id = req.params.id;
      const result = await parcelCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // ---------------- STRIPE CHECKOUT ----------------
    app.post('/create-checkout-session', async (req, res) => {
      try {
        const paymentInfo = req.body;
        const amount = parseInt(paymentInfo.cost) * 100;

        const session = await stripe.checkout.sessions.create({
          line_items: [
            {
              price_data: {
                currency: 'usd',
                unit_amount: amount,
                product_data: { name: `Please Pay for ${paymentInfo.parcelName}` },
              },
              quantity: 1,
            },
          ],
          mode: 'payment',
          metadata: {
            parcelId: paymentInfo.parcelId,
            parcelName: paymentInfo.parcelName,
          },
          customer_email: paymentInfo.SenderEmail,
          success_url: `${process.env.CLIENT_URL}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/dashboard/payment-cancel`,
        });

        res.send({ url: session.url });
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    // ---------------- PAYMENT SUCCESS ----------------
    app.patch('/payment-success', async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const trackingId = generateTrackingId()

        if (session.payment_status === "paid") {
          const id = session.metadata.parcelId;

          // update parcel
          const update = {
            $set: {
              paymentStatus: 'paid',
              trackingId: trackingId,
            },
          };

          const parcelUpdate = await parcelCollection.updateOne({ _id: new ObjectId(id) }, update);

          // create payment record
          const payment = {
            amount: (session.amount_total || 0) / 100,
            currency: session.currency,
            customerEmail: session.customer_email,
            parcelId: session.metadata.parcelId,
            parcelName: session.metadata.parcelName,
            transactionId: session.payment_intent,
            paymentStatus: session.payment_status,
            paidAt: new Date(),
          };

          const paymentResult = await paymentCollection.insertOne(payment);

          return res.send({
            success: true,
            message: "Payment saved successfully",
            parcelUpdate,
            trackingId: trackingId,
            paymentInfo: paymentResult,
          });
        }

        return res.send({ success: false, message: "Payment not completed" });
      } catch (error) {
        res.status(500).send({ success: false, error: error.message });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {}
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
