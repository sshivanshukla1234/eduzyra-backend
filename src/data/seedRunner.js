import 'dotenv/config'
import { connectDB } from '../config/db.js'
import Course from '../models/Course.js'
import Coupon from '../models/Coupon.js'
import User from '../models/User.js'
import Lesson from '../models/Lesson.js'
import Enrollment from '../models/Enrollment.js'
import Order from '../models/Order.js'
import Notification from '../models/Notification.js'
import Certificate from '../models/Certificate.js'
import LiveClass from '../models/LiveClass.js'
import Feedback from '../models/Feedback.js'
import { COURSES_SEED } from './coursesSeed.js'
import { COUPONS_SEED } from './couponsSeed.js'

function buildLessonsForCourse(courseId, course) {
  const lessons = []
  const { syllabus = [] } = course

  for (let mIdx = 0; mIdx < syllabus.length; mIdx++) {
    const mod = syllabus[mIdx]
    const numLessons = Math.max(1, Math.min(mod.lessons || 1, 8))

    for (let lIdx = 1; lIdx <= numLessons; lIdx++) {
      const typePick = lIdx % 4
      let type = 'video'
      if (typePick === 2) type = 'quiz'
      else if (typePick === 3 && lIdx === numLessons) type = 'assignment'
      else if (typePick === 0 && lIdx !== 1) type = 'notes'

      const base = {
        course: courseId,
        title: `${mod.title} — Lesson ${lIdx}`,
        moduleTitle: mod.title,
        moduleIndex: mIdx,
        order: lIdx,
        type,
        published: true,
      }

      if (type === 'video') {
        base.videoUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ'
      } else if (type === 'notes') {
        base.notes = `# ${mod.title} — Notes ${lIdx}\n\nKey concepts covered in this lesson:\n- Overview of ${mod.title.toLowerCase()} fundamentals\n- Common pitfalls and how to avoid them\n- Practice exercises and solutions\n\n## Summary\n\nReview the material and complete the checkpoint before moving on.`
      } else if (type === 'quiz') {
        base.quizQuestions = [
          {
            question: `Which of the following best describes "${mod.title}"?`,
            options: [
              'A collection of unrelated topics',
              'A structured module building on prior concepts',
              'An optional bonus section',
              'A quiz with no learning objective',
            ],
            correctIndex: 1,
          },
          {
            question: `What is the recommended order for completing Lesson ${lIdx}?`,
            options: [
              'Skip straight to the quiz',
              'Read/watch, take notes, then practice',
              'Only watch the first 30 seconds',
              'Complete the assignment first without context',
            ],
            correctIndex: 1,
          },
          {
            question: `How many lessons are in the "${mod.title}" module?`,
            options: ['1', String(numLessons), '100', '0'],
            correctIndex: 1,
          },
        ]
      } else if (type === 'assignment') {
        base.notes = `# ${mod.title} — Capstone Assignment\n\n## Objective\nBuild a small deliverable that demonstrates mastery of the module.\n\n## Submission\n1. Fork the starter repo\n2. Complete the tasks listed in the README\n3. Submit a link via the attachment upload\n\n## Rubric\n- Functionality: 60%\n- Code quality: 25%\n- Documentation: 15%`
      }

      lessons.push(base)
    }
  }

  return lessons
}

export async function upsertUser({ email, name, role, password }) {
  const existing = await User.findOne({ email }).select('+password')
  if (existing) {
    existing.name = name
    existing.role = role
    existing.isVerified = true
    if (password) {
      const matches = await existing.comparePassword(password).catch(() => false)
      if (!matches) {
        existing.password = password
      }
    }
    await existing.save()
    return existing
  }
  return User.create({ email, name, role, password, isVerified: true })
}

/**
 * seedDatabase
 * Modular, idempotent database seeder that creates or updates courses,
 * coupons, verified users (admin, instructors, students), lessons, orders,
 * enrollments, certificates, live sessions, and feedback.
 *
 * @param {object} options
 * @param {boolean} [options.silent=false] Suppress console logs
 * @returns {Promise<object>} Counts of documents across collections
 */
export async function seedDatabase({ silent = false } = {}) {
  const log = (...args) => { if (!silent) console.log(...args) }

  log('\n── Seeding Courses ──')
  const upsertedCourses = []
  for (const course of COURSES_SEED) {
    const doc = await Course.findOneAndUpdate(
      { slug: course.slug },
      { $set: course },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    upsertedCourses.push(doc)
  }
  log(`  ✅ ${upsertedCourses.length} courses upserted.`)

  log('\n── Seeding Coupons ──')
  for (const coupon of COUPONS_SEED) {
    await Coupon.findOneAndUpdate(
      { code: coupon.code },
      { $set: coupon },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  }
  log(`  ✅ ${COUPONS_SEED.length} coupons upserted (${COUPONS_SEED.filter((c) => c.active).length} active, ${COUPONS_SEED.filter((c) => !c.active).length} inactive).`)

  log('\n── Seeding Users ──')
  const admin = await upsertUser({
    email: 'admin@eduzyra.dev',
    name: 'Eduzyra Admin',
    role: 'admin',
    password: 'ChangeMe123!',
  })
  log(`  ✅ Admin       → ${admin.email} / ChangeMe123!`)

  const instructorData = [
    { name: 'Aditi Rao', email: 'aditi.rao@eduzyra.dev' },
    { name: 'Ramesh Pillai', email: 'ramesh.pillai@eduzyra.dev' },
    { name: 'Deepika Nair', email: 'deepika.nair@eduzyra.dev' },
    { name: 'Vikram Suresh', email: 'vikram.suresh@eduzyra.dev' },
    { name: 'Sanjana Iyer', email: 'sanjana.iyer@eduzyra.dev' },
    { name: 'Karthik Menon', email: 'karthik.menon@eduzyra.dev' },
    { name: 'Priya Nambiar', email: 'priya.nambiar@eduzyra.dev' },
    { name: 'Farhan Sheikh', email: 'farhan.sheikh@eduzyra.dev' },
    { name: 'Neha Kulkarni', email: 'neha.kulkarni@eduzyra.dev' },
    { name: 'Arjun Verma', email: 'arjun.verma@eduzyra.dev' },
    { name: 'Ritu Chawla', email: 'ritu.chawla@eduzyra.dev' },
    { name: 'Meera Joshi', email: 'meera.joshi@eduzyra.dev' },
    { name: 'Dr. Sameer Gupta', email: 'sameer.gupta@eduzyra.dev' },
  ]

  const instructorMap = {}
  for (const inst of instructorData) {
    const doc = await upsertUser({
      email: inst.email,
      name: inst.name,
      role: 'instructor',
      password: 'Instructor123!',
    })
    instructorMap[inst.name] = doc
    log(`  ✅ Instructor  → ${doc.email} (${inst.name})`)
  }

  const studentUsers = [
    { email: 'student@eduzyra.dev', name: 'Demo Student' },
    { email: 'priya.sharma@eduzyra.dev', name: 'Priya Sharma' },
    { email: 'rahul.verma@eduzyra.dev', name: 'Rahul Verma' },
    { email: 'ananya.iyer@eduzyra.dev', name: 'Ananya Iyer' },
  ]
  const studentDocs = []
  for (const s of studentUsers) {
    const doc = await upsertUser({
      email: s.email,
      name: s.name,
      role: 'student',
      password: 'Student123!',
    })
    studentDocs.push(doc)
    log(`  ✅ Student     → ${doc.email} (${s.name})`)
  }

  log('\n── Linking Instructors to Courses ──')
  let linked = 0
  for (const c of upsertedCourses) {
    const prof = instructorMap[c.instructorName] || instructorMap['Aditi Rao']
    if (!c.instructor || String(c.instructor) !== String(prof._id)) {
      c.instructor = prof._id
      await c.save()
      linked++
    }
  }
  log(`  ✅ Linked ${linked} courses to verified instructor documents.`)

  log('\n── Seeding Lessons ──')
  let totalLessons = 0
  for (const course of upsertedCourses) {
    const existing = await Lesson.countDocuments({ course: course._id })
    if (existing > 0) {
      totalLessons += existing
      continue
    }
    const lessons = buildLessonsForCourse(course._id, course)
    if (lessons.length) {
      await Lesson.insertMany(lessons)
      totalLessons += lessons.length
    }
  }
  log(`  ✅ ${totalLessons} lessons across ${upsertedCourses.length} courses.`)

  log('\n── Seeding Orders & Enrollments ──')
  const primaryStudent = studentDocs[0]
  const sampleCourses = [upsertedCourses[0], upsertedCourses[1], upsertedCourses[2], upsertedCourses[3]]
  const progressSamples = [100, 65, 30, 10]

  for (let i = 0; i < sampleCourses.length; i++) {
    const course = sampleCourses[i]
    const progress = progressSamples[i]
    const completed = progress === 100

    const txId = `eduzyra_${primaryStudent._id.toString().slice(-4)}_${course._id.toString().slice(-6)}`
    const order = await Order.findOneAndUpdate(
      { transactionId: txId },
      {
        $set: {
          student: primaryStudent._id,
          course: course._id,
          amount: (course.price || 999) * 100,
          currency: 'INR',
          status: 'paid',
          transactionId: txId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    await Enrollment.findOneAndUpdate(
      { student: primaryStudent._id, course: course._id },
      {
        $set: {
          student: primaryStudent._id,
          course: course._id,
          order: order._id,
          progress,
          completedAt: completed ? new Date() : null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    await User.updateOne(
      { _id: primaryStudent._id },
      { $addToSet: { enrolledCourses: course._id } },
    )
    log(`     → ${primaryStudent.email}: ${course.title.padEnd(40)} ${progress}% ${completed ? '✓ completed' : ''}`)
  }

  // Seed secondary student enrollment
  const secondaryStudent = studentDocs[1]
  const secCourse = upsertedCourses[4]
  const secTxId = `eduzyra_${secondaryStudent._id.toString().slice(-4)}_${secCourse._id.toString().slice(-6)}`
  const secOrder = await Order.findOneAndUpdate(
    { transactionId: secTxId },
    {
      $set: {
        student: secondaryStudent._id,
        course: secCourse._id,
        amount: (secCourse.price || 999) * 100,
        currency: 'INR',
        status: 'paid',
        transactionId: secTxId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  await Enrollment.findOneAndUpdate(
    { student: secondaryStudent._id, course: secCourse._id },
    {
      $set: {
        student: secondaryStudent._id,
        course: secCourse._id,
        order: secOrder._id,
        progress: 45,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  await User.updateOne(
    { _id: secondaryStudent._id },
    { $addToSet: { enrolledCourses: secCourse._id } },
  )

  log('\n── Seeding Certificates ──')
  const certCourse = sampleCourses[0]
  const certificateId = `EDU-2026-${certCourse.code.replace(/[^A-Za-z0-9]/g, '')}-${primaryStudent._id.toString().slice(-4)}`
  const issuedOn = new Date().toISOString().slice(0, 10)
  await Certificate.findOneAndUpdate(
    { certificateId },
    {
      $set: {
        certificateId,
        student: primaryStudent._id,
        studentName: primaryStudent.name,
        course: certCourse._id,
        courseTitle: certCourse.title,
        issuedOn,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  log(`  ✅ Certificate ${certificateId} → "${certCourse.title}"`)

  log('\n── Seeding Notifications ──')
  const notifications = [
    {
      type: 'enrollment',
      title: `Welcome to "${sampleCourses[1].title}"!`,
      body: `Your enrollment was successful. Start Module 1 now.`,
      link: `/learn/${sampleCourses[1].slug}`,
      read: false,
    },
    {
      type: 'certificate',
      title: `Certificate issued: "${sampleCourses[0].title}"`,
      body: 'Congratulations on finishing the course! Download your certificate now.',
      link: `/certificate/${certificateId}`,
      read: true,
    },
    {
      type: 'coupon',
      title: 'Special offer: WELCOME10',
      body: 'Use WELCOME10 for 10% off any course this semester.',
      link: '/courses',
      read: false,
    },
    {
      type: 'payment',
      title: 'Payment confirmed',
      body: `Your payment for "${sampleCourses[0].title}" was processed successfully.`,
      link: '/dashboard',
      read: true,
    },
    {
      type: 'system',
      title: 'Account active',
      body: 'Welcome to Eduzyra! Complete your profile to get personalized course suggestions.',
      link: '/profile',
      read: true,
    },
  ]
  for (const n of notifications) {
    await Notification.findOneAndUpdate(
      { user: primaryStudent._id, title: n.title },
      { $set: { user: primaryStudent._id, ...n } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  }
  log(`  ✅ ${notifications.length} notifications seeded for ${primaryStudent.email}`)

  log('\n── Seeding Live Classes ──')
  const liveSession1Start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
  await LiveClass.findOneAndUpdate(
    { title: 'Interactive Web Architecture Workshop' },
    {
      $set: {
        course: sampleCourses[0]._id,
        instructor: sampleCourses[0].instructor,
        title: 'Interactive Web Architecture Workshop',
        description: 'Hands-on architectural review and Q&A session with the instructor.',
        startsAt: liveSession1Start,
        durationMinutes: 60,
        meetingProvider: 'GOOGLE_MEET',
        meetingUrl: 'https://meet.google.com/abc-defg-hij',
        status: 'scheduled',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  log(`  ✅ Live class scheduled for "${sampleCourses[0].title}"`)

  log('\n── Seeding Feedback ──')
  const feedbackEntries = [
    {
      feedbackId: 'FB-SEED-001',
      name: 'Rohan Gupta',
      email: 'rohan.gupta@example.com',
      role: 'Student',
      courseId: sampleCourses[0].slug,
      courseTitle: sampleCourses[0].title,
      rating: 5,
      category: 'Course Feedback',
      message: 'Excellent hands-on practical syllabus! The capstone project was very clear.',
    },
    {
      feedbackId: 'FB-SEED-002',
      name: 'Swati Sen',
      email: 'swati.sen@example.com',
      role: 'Student',
      courseId: sampleCourses[1].slug,
      courseTitle: sampleCourses[1].title,
      rating: 5,
      category: 'Course Feedback',
      message: 'Great instructor pacing and well organized modules.',
    },
  ]
  for (const fb of feedbackEntries) {
    await Feedback.findOneAndUpdate(
      { feedbackId: fb.feedbackId },
      { $set: fb },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  }
  log(`  ✅ ${feedbackEntries.length} feedback entries seeded.`)

  const counts = {
    courses: await Course.countDocuments(),
    coupons: await Coupon.countDocuments(),
    users: await User.countDocuments(),
    lessons: await Lesson.countDocuments(),
    orders: await Order.countDocuments(),
    enrollments: await Enrollment.countDocuments(),
    certificates: await Certificate.countDocuments(),
    notifications: await Notification.countDocuments(),
    liveClasses: await LiveClass.countDocuments(),
    feedback: await Feedback.countDocuments(),
  }

  log('\n── Seed Summary ──')
  Object.entries(counts).forEach(([k, v]) => log(`  ${k.padEnd(15)} ${v}`))
  return counts
}

// Auto-run when invoked as a CLI script: `node src/data/seedRunner.js`
if (process.argv[1]?.includes('seedRunner.js')) {
  async function run() {
    await connectDB()
    await seedDatabase()
    console.log('\nSeed complete. Process exiting.')
    process.exit(0)
  }
  run().catch((err) => {
    console.error('\n❌ Seed failed:', err)
    process.exit(1)
  })
}
