import assert from 'node:assert/strict'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import app from '../src/app.js'
import Course from '../src/models/Course.js'
import Coupon from '../src/models/Coupon.js'
import User from '../src/models/User.js'
import Lesson from '../src/models/Lesson.js'
import Enrollment from '../src/models/Enrollment.js'
import Order from '../src/models/Order.js'
import Certificate from '../src/models/Certificate.js'
import LiveClass from '../src/models/LiveClass.js'
import Feedback from '../src/models/Feedback.js'
import { seedDatabase } from '../src/data/seedRunner.js'

async function runSeedAndApiTests() {
  console.log('\n======================================================')
  console.log('   Running Seed Integration & Catalog API Tests')
  console.log('======================================================\n')

  process.env.NODE_ENV = 'test'
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_for_unit_tests_12345678'

  const mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri('test_seed_api'))
  console.log('✅ In-memory MongoDB connected')

  const server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  const port = server.address().port
  const baseUrl = `http://127.0.0.1:${port}`

  let failed = false

  try {
    // -------------------------------------------------------------
    // Test 1: Run seedDatabase
    // -------------------------------------------------------------
    console.log('\n[Test 1] Running seedDatabase()...')
    const counts1 = await seedDatabase({ silent: true })
    assert.equal(counts1.courses, 49, 'Must seed all 49 courses')
    assert.equal(counts1.coupons, 5, 'Must seed 5 coupons')
    assert.equal(counts1.users, 18, 'Must seed 18 users (1 admin + 13 instructors + 4 students)')
    assert.ok(counts1.lessons > 1000, 'Must seed lessons across all courses')
    assert.ok(counts1.orders >= 5, 'Must seed at least 5 orders')
    assert.ok(counts1.enrollments >= 5, 'Must seed at least 5 enrollments')
    assert.ok(counts1.certificates >= 1, 'Must seed certificate')
    assert.ok(counts1.liveClasses >= 1, 'Must seed live classes')
    assert.ok(counts1.feedback >= 2, 'Must seed feedback')
    console.log('✅ Test 1 Passed: Initial seed created expected counts.')

    // -------------------------------------------------------------
    // Test 2: Idempotency Check (Running seedDatabase a second time)
    // -------------------------------------------------------------
    console.log('\n[Test 2] Verifying seed idempotency (no duplicate entries)...')
    const counts2 = await seedDatabase({ silent: true })
    for (const [key, val] of Object.entries(counts1)) {
      assert.equal(counts2[key], val, `Collection count for ${key} must not change on re-seed`)
    }
    console.log('✅ Test 2 Passed: Second seed run produced identical counts (strictly idempotent).')

    // -------------------------------------------------------------
    // Test 3: Instructor Links
    // -------------------------------------------------------------
    console.log('\n[Test 3] Verifying course-instructor links...')
    const allCourses = await Course.find({}).populate('instructor')
    for (const course of allCourses) {
      assert.ok(course.instructor, `Course "${course.title}" must have an instructor ref`)
      assert.equal(
        course.instructor.name,
        course.instructorName,
        `Course instructor name "${course.instructorName}" must match user document "${course.instructor.name}"`,
      )
    }
    console.log('✅ Test 3 Passed: All 49 courses properly linked to genuine instructor documents.')

    // -------------------------------------------------------------
    // Test 4: Course Catalog API (GET /api/courses)
    // -------------------------------------------------------------
    console.log('\n[Test 4] Testing GET /api/courses API response...')
    const resCourses = await fetch(`${baseUrl}/api/courses?limit=50`)
    assert.equal(resCourses.status, 200, 'GET /api/courses must return 200')
    const dataCourses = await resCourses.json()
    assert.equal(dataCourses.total, 49, 'Total courses must be 49')
    assert.ok(Array.isArray(dataCourses.courses), 'courses must be an array')
    assert.equal(dataCourses.courses.length, 49, 'Returned courses count must match limit')
    
    // Verify frontend normalization compatibility
    const sample = dataCourses.courses[0]
    assert.ok(sample.id || sample.slug, 'Course must have id/slug')
    assert.ok(sample.title, 'Course must have title')
    assert.ok(sample.category, 'Course must have category')
    assert.ok(sample.instructor, 'Course must have serialized instructor name')
    console.log('✅ Test 4 Passed: GET /api/courses matches frontend catalog contract.')

    // -------------------------------------------------------------
    // Test 5: Single Course Detail API (GET /api/courses/:slug)
    // -------------------------------------------------------------
    console.log('\n[Test 5] Testing GET /api/courses/:slug API response...')
    const resSingle = await fetch(`${baseUrl}/api/courses/${sample.slug}`)
    assert.equal(resSingle.status, 200, 'GET /api/courses/:slug must return 200')
    const dataSingle = await resSingle.json()
    assert.equal(dataSingle.slug, sample.slug, 'Returned course slug must match requested')
    console.log('✅ Test 5 Passed: GET /api/courses/:slug returns complete course document.')

    // -------------------------------------------------------------
    // Test 6: Seeded User Logins (Student, Instructor, Admin)
    // -------------------------------------------------------------
    console.log('\n[Test 6] Testing login for seeded demo users...')
    const logins = [
      { email: 'admin@eduzyra.dev', password: 'ChangeMe123!', role: 'admin' },
      { email: 'aditi.rao@eduzyra.dev', password: 'Instructor123!', role: 'instructor' },
      { email: 'student@eduzyra.dev', password: 'Student123!', role: 'student' },
      { email: 'priya.sharma@eduzyra.dev', password: 'Student123!', role: 'student' },
    ]

    for (const cred of logins) {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cred.email, password: cred.password }),
      })
      assert.equal(loginRes.status, 200, `Login for ${cred.email} must succeed with 200`)
      const loginData = await loginRes.json()
      assert.ok(loginData.token, `Must return token for ${cred.email}`)
      assert.equal(loginData.user.role, cred.role, `Role must match for ${cred.email}`)
      assert.equal(loginData.user.isVerified, true, `User ${cred.email} must be pre-verified`)
    }
    console.log('✅ Test 6 Passed: Admin, instructors, and students log in successfully without OTP block.')

    // -------------------------------------------------------------
    // Test 7: Student Enrolled Courses & Orders
    // -------------------------------------------------------------
    console.log('\n[Test 7] Testing student enrollments & order history...')
    const studentLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student@eduzyra.dev', password: 'Student123!' }),
    })
    const { token: studentToken } = await studentLogin.json()

    // Check /api/enrollments/me
    const enrollRes = await fetch(`${baseUrl}/api/enrollments/me`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    assert.equal(enrollRes.status, 200, 'GET /api/enrollments/me must return 200')
    const enrollments = await enrollRes.json()
    assert.equal(enrollments.length, 4, 'Demo student must have 4 enrollments')
    console.log('✅ Test 7 Passed: Demo student enrollments populated.')

    // Check /api/payments/me
    const paymentRes = await fetch(`${baseUrl}/api/payments/me`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    assert.equal(paymentRes.status, 200, 'GET /api/payments/me must return 200')
    const payments = await paymentRes.json()
    assert.equal(payments.length, 4, 'Demo student must have 4 order records')
    assert.equal(payments[0].status, 'paid', 'Order status must be paid')
    console.log('✅ Test 7b Passed: Demo student payment orders populated and readable.')

    console.log('\n======================================================')
    console.log('   🎉 All Seed & Catalog API Integration Tests Passed!')
    console.log('======================================================\n')
  } catch (err) {
    failed = true
    console.error('\n❌ Seed Test Suite Failed:', err)
  } finally {
    server.close()
    await mongoose.connection.close()
    await mongod.stop()
    process.exit(failed ? 1 : 0)
  }
}

runSeedAndApiTests().catch((err) => {
  console.error('\n❌ Fatal error in seed test:', err)
  process.exit(1)
})
