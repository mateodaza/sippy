#!/usr/bin/env ts-node
/**
 * End-to-End Test - Simula el flujo completo de WhatsApp
 */

import 'dotenv/config';
import {
  createUserWallet,
  getUserWallet,
  getUserBalance,
  sendPYUSD,
} from './src/services/cdp-wallet.service';

async function testE2E() {
  console.log('🧪 End-to-End Test - SIPPY WhatsApp Bot\n');
  console.log('═'.repeat(50));

  try {
    // Test 1: Wallet existente
    console.log('\n📱 Test 1: Usuario existente (+573116613414)');
    console.log('─'.repeat(50));

    const PHONE_1 = '573116613414';
    const wallet1 = await getUserWallet(PHONE_1);

    if (wallet1) {
      console.log(`✅ Wallet encontrada: ${wallet1.walletAddress}`);
      const balance1 = await getUserBalance(PHONE_1);
      console.log(`💰 Balance: ${balance1} PYUSD`);
    } else {
      console.log(`❌ Wallet no encontrada`);
    }

    // Test 2: Crear nueva wallet
    console.log('\n\n📱 Test 2: Crear nueva wallet (+573001234567)');
    console.log('─'.repeat(50));

    const PHONE_2 = '573001234567';
    let wallet2 = await getUserWallet(PHONE_2);

    if (!wallet2) {
      console.log(`📝 Creando nueva wallet...`);
      wallet2 = await createUserWallet(PHONE_2);
      console.log(`✅ Wallet creada: ${wallet2.walletAddress}`);
      console.log(`💡 Envía PYUSD a esta dirección para hacer pruebas`);
    } else {
      console.log(`✅ Wallet ya existe: ${wallet2.walletAddress}`);
      const balance2 = await getUserBalance(PHONE_2);
      console.log(`💰 Balance: ${balance2} PYUSD`);
    }

    // Test 3: Simular comando /send
    console.log('\n\n📱 Test 3: Comando /send (si hay fondos)');
    console.log('─'.repeat(50));

    const TO_ADDRESS = '0x00d18ca9782bE1CaEF611017c2Fbc1a39779A57C';
    const AMOUNT = 0.05;

    if (wallet1) {
      const balance = await getUserBalance(PHONE_1);

      if (balance >= AMOUNT) {
        console.log(`📤 Enviando ${AMOUNT} PYUSD...`);
        const result = await sendPYUSD(PHONE_1, TO_ADDRESS, AMOUNT);

        console.log(`\n✅ TRANSFER EXITOSO!`);
        console.log(`   TX: ${result.transactionHash}`);
        console.log(
          `   Link: https://arbiscan.io/tx/${result.transactionHash}`
        );
      } else {
        console.log(`⚠️  Balance insuficiente (${balance} < ${AMOUNT})`);
      }
    }

    // Resumen final
    console.log('\n\n' + '═'.repeat(50));
    console.log('📊 RESUMEN DE PRUEBAS\n');
    console.log(`✅ Usuario 1 (+${PHONE_1}): ${wallet1 ? 'OK' : 'NO EXISTE'}`);
    console.log(`✅ Usuario 2 (+${PHONE_2}): ${wallet2 ? 'OK' : 'NO EXISTE'}`);
    console.log('\n🎉 Todas las pruebas completadas!\n');
  } catch (error: any) {
    console.error('\n❌ Error en pruebas:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    process.exit(1);
  }
}

testE2E();
