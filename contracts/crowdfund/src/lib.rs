#![no_std]
use soroban_sdk::{contract, contractevent, contractimpl, contracterror, Env, Address, symbol_short};


#[contractevent(topics = ["DONATION"], data_format = "vec")]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Donation {
    pub donor: Address,
    pub amount: i128,
    pub total: i128,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum CrowdfundError {
    AlreadyInitialized = 1,
    InvalidGoalAmount = 2,
    GoalReached = 3,
}

#[contract]
pub struct Crowdfund;

#[contractimpl]
impl Crowdfund {
  pub fn initialize(env: Env, goal: i128) -> Result<(), CrowdfundError> {
    let key = symbol_short!("GOAL");
    if env.storage().instance().has(&key) {
        return Err(CrowdfundError::AlreadyInitialized);
    }
    if goal <= 0 {
        return Err(CrowdfundError::InvalidGoalAmount);
    }
    env.storage().instance().set(&key, &goal);
    env.storage().instance().set(&symbol_short!("TOTAL"), &0i128);
    Ok(())

    }

    pub fn donate(env: Env, donor: Address, amount: i128) -> Result<i128, CrowdfundError> {
     donor.require_auth();
     if amount <= 0 {
        return Err(CrowdfundError::InvalidGoalAmount);
     }

     let total_key = symbol_short!("TOTAL");
     let mut total = env.storage().instance().get(&total_key).unwrap_or(0);
     let goal: i128 = env.storage().instance().get(&symbol_short!("GOAL")).unwrap_or(0);

     if total >= goal {
        return Err(CrowdfundError::GoalReached);
     }

     total += amount;
     env.storage().instance().set(&total_key, &total);

     env.events().publish_event(&Donation {
         donor,
         amount,
         total,
     });
     Ok(total)
    }

    pub fn get_total(env: Env) -> i128 {
        env.storage().instance().get(&symbol_short!("TOTAL")).unwrap_or(0)
    }
    pub fn get_goal(env: Env) -> i128 {
        env.storage().instance().get(&symbol_short!("GOAL")).unwrap_or(0)
    }

}
