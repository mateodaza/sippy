import express from 'express';
import { handlePyusdSwap } from '../commands/pyusd.command';

const router = express.Router();

router.post('/pyusd-swap', async (req, res) => {
  try {
    const { phoneNumber, recipientAddress, amount } = req.body;

    if (!phoneNumber || !recipientAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: phoneNumber, recipientAddress, amount',
      });
    }

    const result = await handlePyusdSwap({
      phoneNumber,
      recipientAddress,
      amount,
    });

    res.json(result);
  } catch (error: any) {
    console.error('PYUSD swap route error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

export default router;

