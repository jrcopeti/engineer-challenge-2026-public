import { Router } from 'express'
import { authenticate } from '../auth'
import { idParams } from '../validation'
import { getCustomerWithHistory } from '../services/customers'

export const customersRouter = Router()

customersRouter.get('/customers/:id', authenticate, (req, res) => {
  const { id } = idParams.parse(req.params)
  res.json(getCustomerWithHistory(id))
})
