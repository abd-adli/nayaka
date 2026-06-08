const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get Landing Page
router.get('/', async (req, res, next) => {
  try {
    const trips = await prisma.trip.findMany({
      orderBy: { id: 'asc' },
    });
    res.render('index', { 
      trips, 
      message: req.query.message, 
      error: req.query.error 
    });
  } catch (error) {
    next(error);
  }
});

// Create Booking
router.post('/book', async (req, res, next) => {
  try {
    const { customerName, customerPhone, tripId } = req.body;

    if (!customerName || !customerPhone || !tripId) {
      return res.redirect('/?error=All fields are required.');
    }

    const id = parseInt(tripId);
    
    // Find the trip to verify slots
    const trip = await prisma.trip.findUnique({
      where: { id },
    });

    if (!trip) {
      return res.redirect('/?error=Selected trip does not exist.');
    }

    if (trip.slotsAvailable <= 0) {
      return res.redirect('/?error=Sorry, this trip is fully booked!');
    }

    // Create booking and update trip slots in a secure transaction
    await prisma.$transaction(async (tx) => {
      // Create the booking
      await tx.booking.create({
        data: {
          customerName,
          customerPhone,
          tripId: id,
          status: 'PENDING',
        },
      });

      // Decrement the slots available
      await tx.trip.update({
        where: { id },
        data: {
          slotsAvailable: {
            decrement: 1,
          },
        },
      });
    });

    res.redirect('/?message=Booking submitted successfully! Our team will contact you shortly via WhatsApp.');
  } catch (error) {
    next(error);
  }
});

module.exports = router;
