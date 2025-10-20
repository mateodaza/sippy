#!/usr/bin/env ts-node
/**
 * Full E2E Test - Usuario existente con balance
 */

import 'dotenv/config';
import {
  getUserWallet,
  getUserBalance,
  sendPYUSD,
} from './src/services/cdp-wallet.service';

async function testFullE2E() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   🧪 Sippy E2E Test - Usuario Existente       ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const PHONE = '573116613414';
  const TEST_RECIPIENT = '0x00d18ca9782bE1CaEF611017c2Fbc1a39779A57C'; // Tu wallet de prueba
  const SEND_AMOUNT = 0.1; // 0.1 PYUSD

  try {
    // Step 1: Verificar wallet
    console.log('📍 Step 1: Verificar wallet existente');
    console.log('─'.repeat(50));

    const wallet = await getUserWallet(PHONE);

    if (!wallet) {
      console.log('❌ Wallet no encontrada');
      console.log('💡 Envía "start" desde WhatsApp primero\n');
      process.exit(1);
    }

    console.log(`✅ Wallet encontrada`);
    console.log(`   📱 Phone: +${PHONE}`);
    console.log(`   📍 Address: ${wallet.walletAddress}`);
    console.log(`   📅 Creada: ${new Date(wallet.createdAt).toLocaleString()}`);
    console.log(
      `   🕐 Última actividad: ${new Date(
        wallet.lastActivity
      ).toLocaleString()}`
    );

    // Step 2: Verificar balance
    console.log('\n💰 Step 2: Verificar balance PYUSD');
    console.log('─'.repeat(50));

    const balance = await getUserBalance(PHONE);
    console.log(`✅ Balance: ${balance.toFixed(6)} PYUSD`);

    if (balance < SEND_AMOUNT) {
      console.log(`⚠️  Balance insuficiente para test de envío`);
      console.log(`   Necesitas: ${SEND_AMOUNT} PYUSD`);
      console.log(`   Tienes: ${balance.toFixed(6)} PYUSD`);
      console.log(`\n💡 Envía PYUSD a: ${wallet.walletAddress}\n`);
      process.exit(0);
    }

    // Step 3: Test de envío (opcional)
    console.log('\n📤 Step 3: Test de envío PYUSD');
    console.log('─'.repeat(50));
    console.log(`   De: ${wallet.walletAddress}`);
    console.log(`   Para: ${TEST_RECIPIENT}`);
    console.log(`   Monto: ${SEND_AMOUNT} PYUSD`);

    console.log('\n⏳ Enviando transacción...');
    const result = await sendPYUSD(PHONE, TEST_RECIPIENT, SEND_AMOUNT);

    console.log('\n✅ ¡TRANSACCIÓN EXITOSA!');
    console.log(`   TX Hash: ${result.transactionHash}`);
    console.log(
      `   🔗 Arbiscan: https://arbiscan.io/tx/${result.transactionHash}`
    );
    console.log(`   💰 Monto: ${result.amount} PYUSD`);
    console.log(`   📍 Receptor: ${result.recipient}`);

    // Step 4: Verificar nuevo balance
    console.log('\n💰 Step 4: Verificar nuevo balance');
    console.log('─'.repeat(50));

    const newBalance = await getUserBalance(PHONE);
    console.log(`✅ Nuevo balance: ${newBalance.toFixed(6)} PYUSD`);
    console.log(`   Diferencia: -${(balance - newBalance).toFixed(6)} PYUSD`);

    // Resumen
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   ✅ TODAS LAS PRUEBAS PASARON                ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.log('📊 Resumen:');
    console.log(`   ✓ Wallet verificada`);
    console.log(`   ✓ Balance consultado: ${balance.toFixed(6)} PYUSD`);
    console.log(`   ✓ Envío exitoso: ${SEND_AMOUNT} PYUSD`);
    console.log(`   ✓ Nuevo balance: ${newBalance.toFixed(6)} PYUSD`);
    console.log('');
    console.log('🎉 El sistema está funcionando correctamente!\n');
  } catch (error: any) {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   ❌ ERROR EN PRUEBAS                         ║');
    console.log('╚════════════════════════════════════════════════╝\n');

    console.error('Error:', error.message);

    if (error.message?.includes('insufficient')) {
      console.log(
        '\n💡 Solución: Asegúrate de tener suficiente ETH en Arbitrum para gas fees\n'
      );
    } else if (error.message?.includes('balance')) {
      console.log('\n💡 Solución: Envía más PYUSD a la wallet\n');
    }

    process.exit(1);
  }
}

testFullE2E();
